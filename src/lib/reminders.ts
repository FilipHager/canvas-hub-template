/**
 * Påminnelser: slår ihop Canvas-uppgifter (med inlämningsstatus) och det AI:n
 * hittat i meddelanden till en lista, tar bort dubbletter och delar in i
 * Försenat / Idag / Denna vecka / Kommande.
 */
import type { AnnouncementAnalysis, AssignmentAnalysis, ExtractedTask, GroupQuestion, Relevance, TaskType } from "./ai/analyze";
import { query } from "./db";
import { daysFromToday, toLocal } from "./format";
import type { Profile } from "./profile";

export interface Reminder {
  id: string;
  source: "assignment" | "announcement";
  courseId: number;
  courseCode: string;
  courseName: string;
  title: string;
  type: TaskType;
  date: string; // svensk lokaltid "YYYY-MM-DD" eller "YYYY-MM-DDTHH:mm"
  location: string | null;
  groupInfo: string | null;
  groupName: string | null;
  members: string[];
  preparations: string[];
  groupQuestion: GroupQuestion | null;
  relevance: Relevance;
  confidence: number;
  url: string | null;
  sourceTitle: string;
  submission: { state: string | null; missing: boolean } | null;
  done: boolean;
}

export type Bucket = "overdue" | "today" | "week" | "later";

const words = (s: string) =>
  new Set(s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((w) => w.length >= 3));

function similar(a: string, b: string) {
  const A = words(a);
  const B = words(b);
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.max(1, Math.min(A.size, B.size));
}

/** Samma kurs, samma dag och liknande titel/typ → samma sak. */
const isDuplicate = (a: Reminder, b: Reminder) =>
  a.courseId === b.courseId &&
  a.date.slice(0, 10) === b.date.slice(0, 10) &&
  (similar(a.title, b.title) >= 0.4 || (a.type === b.type && a.type !== "other"));

/** Fyller i det som saknas i `keep` med info från dubbletten. */
function merge(keep: Reminder, dup: Reminder) {
  keep.location ??= dup.location;
  keep.groupInfo ??= dup.groupInfo;
  if (!keep.date.includes("T") && dup.date.includes("T")) keep.date = dup.date;
  keep.preparations = [...new Set([...keep.preparations, ...dup.preparations])];
  keep.groupQuestion ??= dup.groupQuestion;
}

export async function loadReminders(profile: Profile): Promise<Reminder[]> {
  const [asg, ann, states] = await Promise.all([
    query<{
      id: string; course_id: string; course_code: string; course_name: string; name: string; due_at: string;
      html_url: string; submission_state: string | null; missing: boolean; result: AssignmentAnalysis | null;
    }>(
      `select a.id, a.course_id, c.course_code, c.name as course_name, a.name, a.due_at, a.html_url, a.submission_state, a.missing, x.result
       from assignments a join courses c on c.id = a.course_id
       left join assignment_analyses x on x.assignment_id = a.id`
    ),
    query<{ id: string; course_id: string; course_code: string; course_name: string; title: string; html_url: string; result: AnnouncementAnalysis }>(
      `select a.id, a.course_id, c.course_code, c.name as course_name, a.title, a.html_url, x.result
       from announcements a join courses c on c.id = a.course_id
       join analyses x on x.announcement_id = a.id`
    ),
    query<{ id: string; done_at: string | null }>("select id, done_at from reminder_state where done_at is not null"),
  ]);

  const done = new Set(states.map((s) => s.id));
  const myName = profile.canvas?.name;
  const groupByName = new Map(profile.groups.map((g) => [g.name, g]));
  const canvasUrl = (u: string) => (u.startsWith("https://canvas.kth.se/") ? u : null);

  const build = (
    t: ExtractedTask, id: string, source: Reminder["source"], courseId: number, courseCode: string, courseName: string,
    url: string, sourceTitle: string, fallbackDate: string | null, submission: Reminder["submission"]
  ): Reminder | null => {
    const date = t.date ?? fallbackDate;
    if (!date) return null;
    const group = t.my_group_name ? groupByName.get(t.my_group_name) : undefined;
    return {
      id, source, courseId, courseCode, courseName, title: t.title, type: t.type, date,
      location: t.location, groupInfo: t.group_info, groupName: group?.name ?? null,
      members: group && group.members.length <= 20 ? group.members.map((m) => m.name).filter((n) => n !== myName) : [],
      preparations: t.preparations ?? [], groupQuestion: t.group_question ?? null,
      relevance: t.relevance, confidence: t.confidence, url: canvasUrl(url), sourceTitle,
      submission: t.type === "deadline" ? submission : null, done: done.has(id),
    };
  };

  // 1. Canvas-uppgifter (har status, så de vinner vid dubbletter)
  const fromAssignments: Reminder[] = [];
  for (const a of asg) {
    const dueLocal = toLocal(a.due_at);
    const submission = { state: a.submission_state, missing: a.missing };
    const items: ExtractedTask[] = a.result?.items?.length
      ? a.result.items
      : [{
          title: a.name, date: dueLocal, type: "deadline", location: null, group_info: null, my_group_name: null,
          preparations: [], group_question: null, relevance: "applies", confidence: 1,
        }];
    items.forEach((t, i) => {
      // Inlämningens tid kommer alltid från Canvas (exakt), inte från AI:n.
      const task = t.type === "deadline" ? { ...t, date: dueLocal } : t;
      const r = build(task, `asg:${a.id}:${i}`, "assignment", Number(a.course_id), a.course_code, a.course_name, a.html_url, a.name, dueLocal, submission);
      if (r) fromAssignments.push(r);
    });
  }

  // 2. Uppgifter AI:n hittat i meddelanden
  const fromAnnouncements: Reminder[] = [];
  for (const a of ann) {
    if (a.result.relevance === "not_applies") continue;
    a.result.tasks.forEach((t, i) => {
      const r = build(t, `ann:${a.id}:${i}`, "announcement", Number(a.course_id), a.course_code, a.course_name, a.html_url, a.title, null, null);
      if (r) fromAnnouncements.push(r);
    });
  }

  // 3. Ta bort dubbletter (flera meddelanden om samma tenta, eller meddelande + uppgift om samma sak)
  const result: Reminder[] = [...fromAssignments];
  for (const r of fromAnnouncements) {
    const dup = result.find((x) => isDuplicate(x, r));
    if (dup) merge(dup, r);
    else result.push(r);
  }

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/** Vilken rubrik påminnelsen hamnar under. null = visas inte (gammal). */
export function bucketOf(r: Reminder): Bucket | null {
  const days = daysFromToday(r.date);
  if (days < 0) {
    // Bara missade inlämningar från de senaste två veckorna visas som försenade.
    const unsubmitted = r.submission && (r.submission.state === "unsubmitted" || r.submission.missing);
    return unsubmitted && days >= -14 ? "overdue" : null;
  }
  if (days === 0) return "today";
  if (days <= 7) return "week";
  return "later";
}
