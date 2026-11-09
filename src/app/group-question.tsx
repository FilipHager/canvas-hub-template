import type { GroupQuestion } from "@/lib/ai/analyze";
import { saveGroupFact } from "./actions";
import { SubmitButton } from "./components";

/**
 * "Vilken labbgrupp är du i?" – visas i påminnelsen när AI:n vet att det är en
 * gruppaktivitet men inte vilken grupp du är i. Ett klick sparar svaret och
 * uppdaterar kursens datum och lokaler.
 */
export function GroupQuestionForm({ q, courseId }: { q: GroupQuestion; courseId: number }) {
  const options = [...new Set(q.options)].slice(0, 8);
  return (
    <form action={saveGroupFact} className="group-q">
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="kind" value={q.kind} />
      <p className="group-q-text">❓ {q.question}</p>
      <div className="group-q-options">
        {options.map((o) => (
          <button key={o} type="submit" name="choice" value={o} className="chip">
            {o}
          </button>
        ))}
      </div>
      <div className="group-q-other">
        <input name="label" placeholder="Annan grupp…" aria-label="Annan grupp" />
        <SubmitButton pending="Uppdaterar…" className="btn btn-small">Spara</SubmitButton>
      </div>
    </form>
  );
}

export function Preparations({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="preps">
      <span className="preps-title">Förbered:</span>
      <ul>
        {items.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
