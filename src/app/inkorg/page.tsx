import Link from "next/link";
import { query } from "@/lib/db";
import type { AnnouncementAnalysis, Importance, Relevance } from "@/lib/ai/analyze";
import { courseTitle, formatDate, formatLocal, shortCode } from "@/lib/format";
import { loadProfile } from "@/lib/profile";
import { markAllRead, setRead } from "../actions";
import { SubmitButton } from "../components";
import { GroupQuestionForm, Preparations } from "../group-question";

interface Row {
  id: number;
  course_id: number;
  course_code: string;
  course_name: string;
  title: string;
  message_text: string;
  author: string | null;
  posted_at: string;
  html_url: string;
  read_at: string | null;
  result: AnnouncementAnalysis | null;
}

const IMPORTANCE: Record<Importance, { label: string; cls: string }> = {
  must_act: { label: "Måste agera", cls: "tag-red" },
  good_to_know: { label: "Bra att veta", cls: "tag-blue" },
  unimportant: { label: "Oviktigt", cls: "tag-grey" },
};

const RELEVANCE: Record<Relevance, { label: string; cls: string }> = {
  applies: { label: "Gäller dig", cls: "tag-green" },
  not_applies: { label: "Gäller inte dig", cls: "tag-grey" },
  uncertain: { label: "Osäkert, kolla", cls: "tag-amber" },
};

const TASK_TYPE: Record<string, string> = {
  deadline: "Deadline", exam: "Tenta", lab: "Labb", seminar: "Seminarium",
  lecture: "Föreläsning", meeting: "Möte", other: "Övrigt",
};

// Länka bara till Canvas, aldrig till något annat.
const safeCanvasUrl = (url: string) => (url.startsWith("https://canvas.kth.se/") ? url : null);

type Search = { kurs?: string; visa?: string; olasta?: string };

function buildHref(current: Search, change: Partial<Search>) {
  const next = { ...current, ...change };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/inkorg?${qs}` : "/inkorg";
}

export default async function Inbox({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const courseFilter = sp.kurs ? Number(sp.kurs) : null;
  const showAll = sp.visa === "alla";
  const onlyUnread = sp.olasta === "1";

  const [rows, courses, profile] = await Promise.all([
    query<Row>(
      `select a.id, a.course_id, c.course_code, c.name as course_name, a.title, a.message_text, a.author, a.posted_at,
              a.html_url, a.read_at, x.result
       from announcements a
       join courses c on c.id = a.course_id
       left join analyses x on x.announcement_id = a.id
       order by a.posted_at desc`
    ),
    query<{ id: number; course_code: string; name: string; n: number }>(
      `select c.id, c.course_code, c.name, count(a.id)::int as n
       from courses c join announcements a on a.course_id = c.id
       group by c.id order by c.course_code`
    ),
    loadProfile(),
  ]);

  if (rows.length === 0) {
    return (
      <div className="empty">
        <h1>Inkorg</h1>
        <p>Inga meddelanden än. Tryck på <strong>Synka</strong> uppe till höger.</p>
      </div>
    );
  }

  const myName = profile.canvas?.name;
  const groupsByName = new Map(profile.groups.map((g) => [g.name, g]));

  const inScope = rows.filter((r) => (courseFilter ? Number(r.course_id) === courseFilter : true));
  const hidden = inScope.filter((r) => r.result?.relevance === "not_applies");
  const visible = inScope.filter(
    (r) => (showAll || r.result?.relevance !== "not_applies") && (!onlyUnread || !r.read_at)
  );
  const unreadCount = inScope.filter((r) => !r.read_at && r.result?.relevance !== "not_applies").length;

  return (
    <>
      <div className="page-head">
        <h1>Inkorg</h1>
        {unreadCount > 0 && (
          <form action={markAllRead}>
            <SubmitButton pending="…" className="btn btn-ghost btn-small">Markera alla som lästa</SubmitButton>
          </form>
        )}
      </div>

      <div className="filters">
        <Link className={`chip ${!courseFilter ? "chip-on" : ""}`} href={buildHref(sp, { kurs: undefined })}>
          Alla kurser
        </Link>
        {courses.map((c) => (
          <Link
            key={c.id}
            title={courseTitle(c.name)}
            className={`chip ${courseFilter === Number(c.id) ? "chip-on" : ""}`}
            href={buildHref(sp, { kurs: String(c.id) })}
          >
            {shortCode(c.course_code)} <span className="muted">{c.n}</span>
          </Link>
        ))}
      </div>
      <div className="filters">
        <Link className={`chip ${onlyUnread ? "chip-on" : ""}`} href={buildHref(sp, { olasta: onlyUnread ? undefined : "1" })}>
          Bara olästa ({unreadCount})
        </Link>
      </div>

      {hidden.length > 0 && (
        <p className="hint">
          {showAll ? (
            <>Visar även {hidden.length} meddelanden som AI:n tror inte gäller dig.{" "}
              <Link href={buildHref(sp, { visa: undefined })}>Dölj dem</Link></>
          ) : (
            <>{hidden.length} meddelanden som inte gäller dig är dolda.{" "}
              <Link href={buildHref(sp, { visa: "alla" })}>Visa ändå</Link></>
          )}
        </p>
      )}

      <ul className="list">
        {visible.map((r) => {
          const a = r.result;
          const imp = a ? IMPORTANCE[a.importance] : null;
          const rel = a ? RELEVANCE[a.relevance] : null;
          const url = safeCanvasUrl(r.html_url);
          return (
            <li key={r.id} className={`card ${r.read_at ? "card-read" : ""} ${a?.relevance === "not_applies" ? "card-dim" : ""}`}>
              <div className="card-meta">
                <span className="course">{shortCode(r.course_code)}</span>
                <span className="course-name">{courseTitle(r.course_name)}</span>
                <span className="muted">· {formatDate(r.posted_at, true)}</span>
                {!r.read_at && <span className="dot" aria-label="oläst" />}
              </div>

              <h2 className="card-title">{r.title}</h2>

              {a ? (
                <>
                  <div className="tags">
                    {imp && <span className={`tag ${imp.cls}`}>{imp.label}</span>}
                    {rel && <span className={`tag ${rel.cls}`} title={a.relevance_reason}>{rel.label}</span>}
                  </div>
                  <p className="summary">{a.summary}</p>
                  {a.my_group_details && (
                    <p className="group-details"><strong>För din grupp:</strong> {a.my_group_details}</p>
                  )}
                  {a.relevance !== "applies" && <p className="reason">{a.relevance_reason}</p>}

                  {a.tasks.length > 0 && (
                    <ul className="tasks">
                      {a.tasks.map((t, i) => {
                        const group = t.my_group_name ? groupsByName.get(t.my_group_name) : undefined;
                        const mates = group?.members.filter((m) => m.name !== myName).map((m) => m.name);
                        return (
                          <li key={i} className={t.relevance === "not_applies" ? "task-dim" : ""}>
                            <span className="task-date">{t.date ? formatLocal(t.date) : "Inget datum"}</span>
                            <span className="task-title">
                              <span className="task-type">{TASK_TYPE[t.type] ?? t.type}</span> {t.title}
                              {t.relevance === "uncertain" && <span className="tag tag-amber tag-tiny">osäkert</span>}
                              {t.confidence < 0.6 && <span className="tag tag-grey tag-tiny">låg säkerhet</span>}
                            </span>
                            {t.location && <span className="task-extra">📍 {t.location}</span>}
                            {t.group_info && <span className="task-extra">👥 {t.group_info}</span>}
                            {group && (
                              <span className="task-extra">
                                👥 {group.name}{mates && mates.length > 0 && mates.length <= 6 ? `: ${mates.join(", ")}` : ""}
                              </span>
                            )}
                            <Preparations items={t.preparations ?? []} />
                            {t.group_question && <GroupQuestionForm q={t.group_question} courseId={Number(r.course_id)} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : (
                <p className="muted">Inte analyserad än. Synka för att analysera.</p>
              )}

              <details className="original">
                <summary>Visa originaltext</summary>
                <p className="original-text">{r.message_text}</p>
                {r.author && <p className="muted">– {r.author}</p>}
              </details>

              <div className="card-actions">
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-small">
                    Öppna i Canvas ↗
                  </a>
                )}
                <form action={setRead.bind(null, r.id, !r.read_at)}>
                  <SubmitButton pending="…" className="btn btn-ghost btn-small">
                    {r.read_at ? "Markera som oläst" : "Markera som läst"}
                  </SubmitButton>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && <p className="muted">Inget att visa med de här filtren.</p>}
    </>
  );
}
