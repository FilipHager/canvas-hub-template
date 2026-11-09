/**
 * Synk: hämta från Canvas → spara i databasen → låt AI:n analysera det som är nytt.
 * Körs av sync-knappen, av cron-jobbet och av `npm run sync`.
 */
import {
  getActiveCourses,
  getAnnouncements,
  getAssignments,
  getGroupMembers,
  getMyGroups,
  getProfile,
} from "./canvas/api";
import { CanvasAuthError } from "./canvas/client";
import { analyzeAnnouncement, analyzeAssignment, PROMPT_VERSION } from "./ai/analyze";
import { inferGroupFacts } from "./ai/infer-groups";
import { AI_MODEL, AIAuthError, AIQuotaError } from "./ai/provider";
import { suggestProfile } from "./ai/suggest-profile";
import { query } from "./db";
import { ensureSchema } from "./db/schema";
import { htmlToText } from "./html";
import { courseContext, hash, loadProfile, overviewContext, type CanvasProfileData, type Profile } from "./profile";

export interface SyncStats {
  courses: number;
  announcements: number;
  assignments: number;
  analyzed: number;
  cached: number;
  failed: number;
}

/** Kör fn på items med högst `limit` samtidiga anrop. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) await fn(queue.shift()!);
    })
  );
}

/** True om ingen synk har startat den senaste timmen (då kan vi synka i bakgrunden). */
export async function syncIsStale(maxAgeMinutes = 60): Promise<boolean> {
  const [row] = await query<{ fresh: boolean }>(
    "select exists(select 1 from sync_runs where started_at > now() - make_interval(mins => $1)) as fresh",
    [maxAgeMinutes]
  );
  return !row?.fresh;
}

export async function runSync(log: (msg: string) => void = () => {}): Promise<SyncStats> {
  await ensureSchema();
  const [run] = await query<{ id: number }>("insert into sync_runs default values returning id");
  try {
    const stats = await doSync(log);
    await query("update sync_runs set status='ok', finished_at=now(), stats=$2 where id=$1", [
      run.id,
      JSON.stringify(stats),
    ]);
    return stats;
  } catch (err) {
    const status =
      err instanceof CanvasAuthError ? "auth_error"
      : err instanceof AIAuthError ? "ai_auth_error"
      : err instanceof AIQuotaError ? "ai_quota"
      : "error";
    const message = err instanceof Error ? err.message : String(err);
    await query("update sync_runs set status=$2, error=$3, finished_at=now() where id=$1", [run.id, status, message]);
    throw err;
  }
}

/** Hash av profilen för en viss kurs: ändras den analyseras kursens innehåll om. */
const courseHash = (p: Profile, courseId: number) => hash(courseContext(p, courseId) + PROMPT_VERSION);

const isAIProblem = (err: unknown): err is Error => err instanceof AIAuthError || err instanceof AIQuotaError;

async function doSync(log: (msg: string) => void): Promise<SyncStats> {
  // Om AI:n inte fungerar (fel nyckel, slut på kredit) hämtar vi ändå allt från
  // Canvas och hoppar bara över AI-stegen. Felet rapporteras i slutet.
  let aiProblem: Error | null = null;

  // 1. Profil, kurser och grupper från Canvas
  log("Hämtar profil och kurser från Canvas…");
  const [me, courses, groups] = await Promise.all([getProfile(), getActiveCourses(), getMyGroups()]);
  const courseById = new Map(courses.map((c) => [c.id, c]));

  for (const c of courses) {
    await query(
      `insert into courses (id, name, course_code, sections, term, updated_at)
       values ($1,$2,$3,$4,$5,now())
       on conflict (id) do update set name=$2, course_code=$3, sections=$4, term=$5, updated_at=now()`,
      [c.id, c.name, c.course_code, JSON.stringify(c.sections ?? []), c.term ? JSON.stringify(c.term) : null]
    );
  }

  log(`Hämtar ${groups.length} grupper…`);
  for (const g of groups) {
    const members = (await getGroupMembers(g.id)).map((m) => ({ id: m.id, name: m.name }));
    await query(
      `insert into groups (id, name, course_id, category, members, updated_at) values ($1,$2,$3,$4,$5,now())
       on conflict (id) do update set name=$2, course_id=$3, category=$4, members=$5, updated_at=now()`,
      [g.id, g.name, g.course_id ?? null, g.group_category?.name ?? null, JSON.stringify(members)]
    );
  }
  await query("delete from groups where not (id = any($1::bigint[]))", [groups.map((g) => g.id)]);

  const canvas: CanvasProfileData = {
    name: me.name,
    email: me.primary_email ?? me.login_id ?? null,
    courses: courses.map((c) => ({
      id: c.id,
      course_code: c.course_code,
      name: c.name,
      sections: (c.sections ?? []).map((s) => s.name),
    })),
  };
  await query(
    `insert into profile (id, canvas, updated_at) values (1, $1, now())
     on conflict (id) do update set canvas=$1, updated_at=now()`,
    [JSON.stringify(canvas)]
  );

  let profile = await loadProfile();

  // 2. AI-förslag på program/årskurs (bara första gången)
  if (!profile.ai_suggestion) {
    log("Låter AI:n föreslå program och årskurs…");
    try {
      const suggestion = await suggestProfile(overviewContext(profile));
      await query("update profile set ai_suggestion=$1 where id=1", [JSON.stringify(suggestion)]);
    } catch (err) {
      if (!isAIProblem(err)) throw err;
      aiProblem = err;
    }
  }

  // 3. Vilka labb-/seminariegrupper är du i? (bara när dina Canvas-grupper ändrats)
  const groupsText = overviewContext(profile);
  const groupsHash = hash(
    JSON.stringify(profile.groups.map((g) => [g.id, g.name, g.category, g.course_id])) + PROMPT_VERSION
  );
  const [{ groups_hash }] = await query<{ groups_hash: string | null }>("select groups_hash from profile where id=1");
  if (groups_hash !== groupsHash && !aiProblem) try {
    log("Låter AI:n läsa ut dina labb- och seminariegrupper…");
    const facts = (await inferGroupFacts(groupsText)).filter((f) => courseById.has(f.course_id));
    await query("delete from group_facts where source = 'canvas'");
    for (const f of facts) {
      // Skriv aldrig över det du själv har angett.
      await query(
        `insert into group_facts (course_id, kind, label, source, canvas_group_name, updated_at)
         values ($1,$2,$3,'canvas',$4,now())
         on conflict (course_id, kind) do update set label=$3, canvas_group_name=$4, updated_at=now()
         where group_facts.source = 'canvas'`,
        [f.course_id, f.kind, f.label, f.canvas_group_name]
      );
    }
    await query("update profile set groups_hash=$1 where id=1", [groupsHash]);
  } catch (err) {
    if (!isAIProblem(err)) throw err;
    aiProblem = err;
  }
  profile = await loadProfile();

  // 4. Meddelanden
  log("Hämtar meddelanden…");
  const announcements = await getAnnouncements(courses.map((c) => c.id));
  for (const a of announcements) {
    const courseId = Number(a.context_code.replace("course_", ""));
    await query(
      `insert into announcements (id, course_id, title, message_html, message_text, author, posted_at, html_url, content_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (id) do update set title=$3, message_html=$4, message_text=$5, author=$6,
         posted_at=$7, html_url=$8, content_hash=$9, fetched_at=now()`,
      [
        a.id, courseId, a.title, a.message, htmlToText(a.message),
        a.author?.display_name ?? null, a.posted_at ?? a.created_at, a.html_url,
        hash(a.title + "\n" + a.message),
      ]
    );
  }

  // 5. Canvas-uppgifter med deadline (från 14 dagar bakåt och framåt)
  log("Hämtar uppgifter…");
  const since = Date.now() - 14 * 86_400_000;
  const keptAssignments: number[] = [];
  for (const c of courses) {
    for (const a of await getAssignments(c.id)) {
      if (a.published === false || !a.due_at || new Date(a.due_at).getTime() < since) continue;
      const description = htmlToText(a.description ?? "");
      keptAssignments.push(a.id);
      await query(
        `insert into assignments (id, course_id, name, description_text, due_at, html_url,
           submission_state, submitted_at, missing, content_hash, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (id) do update set course_id=$2, name=$3, description_text=$4, due_at=$5, html_url=$6,
           submission_state=$7, submitted_at=$8, missing=$9, content_hash=$10, updated_at=now()`,
        [
          a.id, c.id, a.name, description, a.due_at, a.html_url,
          a.submission?.workflow_state ?? null, a.submission?.submitted_at ?? null,
          Boolean(a.submission?.missing),
          // Inlämningsstatus ingår inte i hashen: att du lämnar in ska inte trigga ny AI-analys.
          hash(a.name + "\n" + a.due_at + "\n" + description),
        ]
      );
    }
  }
  await query("delete from assignments where not (id = any($1::bigint[]))", [keptAssignments]);

  // 6. AI-analys av det som är nytt eller ändrat (resten kommer från cachen)
  type Job =
    | { kind: "announcement"; id: number; courseId: number; contentHash: string; title: string; text: string; author: string | null; postedAt: string }
    | { kind: "assignment"; id: number; courseId: number; contentHash: string; name: string; description: string; dueAt: string | null };

  const annRows = await query<{
    id: string; course_id: string; title: string; message_text: string; author: string | null;
    posted_at: string; content_hash: string; a_hash: string | null; p_hash: string | null;
  }>(
    `select a.id, a.course_id, a.title, a.message_text, a.author, a.posted_at, a.content_hash,
            x.content_hash as a_hash, x.profile_hash as p_hash
     from announcements a left join analyses x on x.announcement_id = a.id`
  );
  const asgRows = await query<{
    id: string; course_id: string; name: string; description_text: string; due_at: string | null;
    content_hash: string; a_hash: string | null; p_hash: string | null;
  }>(
    `select a.id, a.course_id, a.name, a.description_text, a.due_at, a.content_hash,
            x.content_hash as a_hash, x.profile_hash as p_hash
     from assignments a left join assignment_analyses x on x.assignment_id = a.id`
  );

  const jobs: Job[] = [];
  for (const r of annRows) {
    const courseId = Number(r.course_id);
    if (!courseById.has(courseId)) continue;
    if (r.a_hash === r.content_hash && r.p_hash === courseHash(profile, courseId)) continue;
    jobs.push({
      kind: "announcement", id: Number(r.id), courseId, contentHash: r.content_hash,
      title: r.title, text: r.message_text, author: r.author, postedAt: new Date(r.posted_at).toISOString(),
    });
  }
  for (const r of asgRows) {
    const courseId = Number(r.course_id);
    if (!courseById.has(courseId)) continue;
    if (r.a_hash === r.content_hash && r.p_hash === courseHash(profile, courseId)) continue;
    jobs.push({
      kind: "assignment", id: Number(r.id), courseId, contentHash: r.content_hash,
      name: r.name, description: r.description_text, dueAt: r.due_at ? new Date(r.due_at).toISOString() : null,
    });
  }

  const total = annRows.length + asgRows.length;
  log(`Analyserar ${jobs.length} meddelanden/uppgifter med AI (${total - jobs.length} från cache)…`);
  let analyzed = 0;
  let failed = 0;
  await pool(aiProblem ? [] : jobs, 4, async (job) => {
    if (aiProblem) return;
    const course = courseById.get(job.courseId)!;
    const context = courseContext(profile, job.courseId);
    const profileHash = courseHash(profile, job.courseId);
    try {
      if (job.kind === "announcement") {
        const result = await analyzeAnnouncement({
          profileContext: context, courseCode: course.course_code, courseName: course.name,
          title: job.title, text: job.text, postedAt: job.postedAt, author: job.author,
        });
        await query(
          `insert into analyses (announcement_id, content_hash, profile_hash, model, result, created_at)
           values ($1,$2,$3,$4,$5,now())
           on conflict (announcement_id) do update set content_hash=$2, profile_hash=$3, model=$4, result=$5, created_at=now()`,
          [job.id, job.contentHash, profileHash, AI_MODEL, JSON.stringify(result)]
        );
        log(`  ✓ ${course.course_code}: ${job.title}`);
      } else {
        const result = await analyzeAssignment({
          profileContext: context, courseCode: course.course_code, courseName: course.name,
          name: job.name, description: job.description, dueAt: job.dueAt,
        });
        await query(
          `insert into assignment_analyses (assignment_id, content_hash, profile_hash, model, result, created_at)
           values ($1,$2,$3,$4,$5,now())
           on conflict (assignment_id) do update set content_hash=$2, profile_hash=$3, model=$4, result=$5, created_at=now()`,
          [job.id, job.contentHash, profileHash, AI_MODEL, JSON.stringify(result)]
        );
        log(`  ✓ ${course.course_code} (uppgift): ${job.name}`);
      }
      analyzed++;
    } catch (err) {
      if (isAIProblem(err)) {
        aiProblem = err;
        return;
      }
      failed++;
      log(`  ✗ ${job.kind === "announcement" ? job.title : job.name}: ${err instanceof Error ? err.message : err}`);
    }
  });

  if (aiProblem) throw aiProblem; // Canvas-datan är redan sparad; banner visas i appen.

  return {
    courses: courses.length,
    announcements: announcements.length,
    assignments: keptAssignments.length,
    analyzed,
    cached: total - jobs.length,
    failed,
  };
}
