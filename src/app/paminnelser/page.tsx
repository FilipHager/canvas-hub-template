import Link from "next/link";
import { countdown, courseTitle, formatLocal, shortCode } from "@/lib/format";
import { loadProfile } from "@/lib/profile";
import { bucketOf, loadReminders, type Bucket, type Reminder } from "@/lib/reminders";
import { setDone } from "../actions";
import { SubmitButton } from "../components";
import { GroupQuestionForm, Preparations } from "../group-question";

const BUCKETS: { key: Bucket; title: string }[] = [
  { key: "overdue", title: "Missade inlämningar" },
  { key: "today", title: "Idag" },
  { key: "week", title: "Denna vecka" },
  { key: "later", title: "Kommande" },
];

const TYPE: Record<string, { label: string; cls: string }> = {
  deadline: { label: "Inlämning", cls: "tag-red" },
  exam: { label: "Tenta", cls: "tag-red" },
  lab: { label: "Labb", cls: "tag-blue" },
  seminar: { label: "Seminarium", cls: "tag-blue" },
  lecture: { label: "Föreläsning", cls: "tag-grey" },
  meeting: { label: "Möte", cls: "tag-grey" },
  other: { label: "Övrigt", cls: "tag-grey" },
};

function SubmissionTag({ s }: { s: Reminder["submission"] }) {
  if (!s) return null;
  if (s.state === "submitted" || s.state === "pending_review") return <span className="tag tag-green">Inlämnad ✓</span>;
  if (s.state === "graded") return <span className="tag tag-green">Rättad ✓</span>;
  if (s.missing) return <span className="tag tag-red">Saknas</span>;
  return <span className="tag tag-amber">Ej inlämnad</span>;
}

/** "👥 Group A · 11 personer" – tryck för att se namnen. */
function Members({ group, members }: { group: string; members: string[] }) {
  if (!members.length) return <p className="task-extra">👥 {group}</p>;
  return (
    <details className="members">
      <summary className="task-extra">👥 {group} · {members.length + 1} personer</summary>
      <p className="task-extra">{members.join(", ")}</p>
    </details>
  );
}

type Search = { kurs?: string; visa?: string };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const courseFilter = sp.kurs ? Number(sp.kurs) : null;
  const showDone = sp.visa === "klara";

  const profile = await loadProfile();
  const all = (await loadReminders(profile)).filter((r) => bucketOf(r) !== null);
  const inCourse = all.filter((r) => (courseFilter ? r.courseId === courseFilter : true));
  const doneCount = inCourse.filter((r) => r.done).length;
  const visible = inCourse.filter((r) => showDone || !r.done);

  const courses = [...new Map(all.map((r) => [r.courseId, r])).values()]
    .map((r) => [r.courseId, r.courseCode, r.courseName] as const)
    .sort((a, b) => a[1].localeCompare(b[1]));
  const href = (change: Partial<Search>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...change })) if (v) p.set(k, v);
    return p.size ? `/paminnelser?${p}` : "/paminnelser";
  };

  return (
    <>
      <h1>Påminnelser</h1>

      <div className="filters">
        <Link className={`chip ${!courseFilter ? "chip-on" : ""}`} href={href({ kurs: undefined })}>Alla kurser</Link>
        {courses.map(([id, code, name]) => (
          <Link key={id} title={courseTitle(name)} className={`chip ${courseFilter === id ? "chip-on" : ""}`} href={href({ kurs: String(id) })}>
            {shortCode(code)}
          </Link>
        ))}
      </div>
      {doneCount > 0 && (
        <p className="hint">
          {showDone ? (
            <>Visar {doneCount} klara. <Link href={href({ visa: undefined })}>Dölj klara</Link></>
          ) : (
            <>{doneCount} klara är dolda. <Link href={href({ visa: "klara" })}>Visa</Link></>
          )}
        </p>
      )}

      {BUCKETS.map(({ key, title }) => {
        const items = visible.filter((r) => bucketOf(r) === key);
        if (!items.length) return null;
        return (
          <section key={key}>
            <h2 className={`bucket bucket-${key}`}>
              {title} <span className="muted">{items.length}</span>
            </h2>
            <ul className="list">
              {items.map((r) => {
                const type = TYPE[r.type] ?? TYPE.other;
                return (
                  <li key={r.id} className={`card reminder ${r.done ? "card-read" : ""}`}>
                    <div className="reminder-when">
                      <span className="reminder-date">{formatLocal(r.date)}</span>
                      <span className={`countdown countdown-${key}`}>{countdown(r.date)}</span>
                    </div>
                    <div className="card-meta">
                      <span className="course">{shortCode(r.courseCode)}</span>
                      <span className="course-name">{courseTitle(r.courseName)}</span>
                      <span className={`tag ${type.cls}`}>{type.label}</span>
                      <SubmissionTag s={r.submission} />
                      {r.relevance === "uncertain" && <span className="tag tag-amber">Osäkert, kolla</span>}
                    </div>
                    <h3 className="card-title">{r.title}</h3>
                    {r.location && <p className="task-extra">📍 {r.location}</p>}
                    {r.groupName && <Members group={r.groupName} members={r.members} />}
                    {r.groupInfo && !r.groupName && <p className="task-extra">👥 {r.groupInfo}</p>}
                    <Preparations items={r.preparations} />
                    {r.groupQuestion && <GroupQuestionForm q={r.groupQuestion} courseId={r.courseId} />}

                    <div className="card-actions">
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-small">
                          {r.source === "assignment" ? "Uppgiften" : "Meddelandet"} i Canvas ↗
                        </a>
                      )}
                      <form action={setDone.bind(null, r.id, !r.done)}>
                        <SubmitButton pending="…" className="btn btn-ghost btn-small">
                          {r.done ? "Ångra klar" : "Klar ✓"}
                        </SubmitButton>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {visible.length === 0 && <p className="muted">Inga kommande påminnelser. 🎉</p>}
    </>
  );
}
