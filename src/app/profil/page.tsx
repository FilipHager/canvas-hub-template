import { effectiveProgram, KIND_LABEL, loadProfile } from "@/lib/profile";
import { shortCode } from "@/lib/format";
import { deleteGroupFact, saveGroupFact, saveProfile } from "../actions";
import { SubmitButton } from "../components";

export default async function ProfilePage() {
  const p = await loadProfile();
  const prog = effectiveProgram(p);
  const c = p.custom;
  const courseCode = new Map(p.canvas?.courses.map((x) => [x.id, x.course_code]) ?? []);

  if (!p.canvas) {
    return (
      <div className="empty">
        <h1>Profil</h1>
        <p>Ingen profil än. Tryck på <strong>Synka</strong> för att hämta den från Canvas.</p>
      </div>
    );
  }

  return (
    <>
      <h1>Profil</h1>
      <p className="hint">
        Profilen skickas med till AI:n vid varje analys, så att den kan avgöra vad som gäller dig.
        När du sparar analyseras alla meddelanden om med den nya profilen.
      </p>

      {p.ai_suggestion && !prog.confirmed && (
        <div className="card suggestion">
          <strong>AI:ns förslag:</strong> {p.ai_suggestion.program_code ?? "?"}
          {p.ai_suggestion.program_name ? ` – ${p.ai_suggestion.program_name}` : ""}, årskurs{" "}
          {p.ai_suggestion.year ?? "?"}
          <p className="muted">{p.ai_suggestion.reasoning}</p>
          <p className="muted">Stämmer det? Rätta i formuläret nedan om något är fel och tryck på Spara.</p>
        </div>
      )}

      <form action={saveProfile} className="card form">
        <h2>Program</h2>
        <div className="row">
          <label>Programkod
            <input name="program_code" defaultValue={prog.code ?? ""} placeholder="CMETE" />
          </label>
          <label className="narrow">Årskurs
            <input name="year" type="number" min={1} max={6} defaultValue={prog.year ?? ""} />
          </label>
        </div>
        <label>Programnamn
          <input name="program_name" defaultValue={prog.name ?? ""} />
        </label>

        <h2>Om dig</h2>
        <label>Smeknamn
          <input name="nickname" defaultValue={c.nickname ?? ""} />
        </label>
        <label>Inriktningar
          <input name="specializations" defaultValue={c.specializations ?? ""} />
        </label>
        <label>Fria anteckningar
          <textarea
            name="notes"
            rows={4}
            defaultValue={c.notes ?? ""}
            placeholder="t.ex. Jag läser inte längre basårskurserna."
          />
        </label>
        <h2>Nycklarnas utgångsdatum</h2>
        <p className="hint">
          Fyll i när din Canvas-token och OpenAI-nyckel går ut, så varnar appen 14 dagar innan.
          Datumen ser du i Canvas (Konto → Inställningar → Godkända integrationer) och på platform.openai.com → API keys.
        </p>
        <div className="row">
          <label>Canvas-token går ut
            <input name="canvas_token_expires" type="date" defaultValue={c.canvas_token_expires ?? ""} />
          </label>
          <label>OpenAI-nyckel går ut
            <input name="openai_key_expires" type="date" defaultValue={c.openai_key_expires ?? ""} />
          </label>
        </div>
        <SubmitButton pending="Sparar och analyserar om… (kan ta en minut)" className="btn">
          {prog.confirmed ? "Spara" : "Bekräfta och spara"}
        </SubmitButton>
      </form>


      <section className="card">
        <h2>Mina grupper</h2>
        <p className="hint">
          AI:n läser ut dina labb- och seminariegrupper ur Canvas. Rätta om något är fel – det du anger
          här vinner alltid. Svarar du på en gruppfråga i en påminnelse hamnar svaret också här.
        </p>
        <ul className="plain facts">
          {p.facts.map((f) => (
            <li key={`${f.course_id}-${f.kind}`} className="fact">
              <form action={saveGroupFact} className="fact-form">
                <input type="hidden" name="course_id" value={f.course_id} />
                <input type="hidden" name="kind" value={f.kind} />
                <span className="fact-label">
                  <strong>{shortCode(courseCode.get(f.course_id) ?? String(f.course_id))}</strong>{" "}
                  {KIND_LABEL[f.kind] ?? f.kind}
                  <span className="muted"> · {f.source === "user" ? "du angav" : "från Canvas"}</span>
                </span>
                <input name="label" defaultValue={f.label} aria-label="Grupp" />
                <SubmitButton pending="…" className="btn btn-ghost btn-small">Spara</SubmitButton>
              </form>
              <form action={deleteGroupFact.bind(null, f.course_id, f.kind)}>
                <SubmitButton pending="…" className="btn btn-ghost btn-small">Ta bort</SubmitButton>
              </form>
            </li>
          ))}
          {p.facts.length === 0 && <li className="muted">Inga grupper hittade än. Synka eller lägg till nedan.</li>}
        </ul>
        <form action={saveGroupFact} className="fact-form fact-add">
          <select name="course_id" aria-label="Kurs" defaultValue="">
            <option value="" disabled>Kurs…</option>
            {p.canvas.courses.map((x) => (
              <option key={x.id} value={x.id}>{shortCode(x.course_code)}</option>
            ))}
          </select>
          <select name="kind" aria-label="Typ" defaultValue="lab">
            {Object.entries(KIND_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input name="label" placeholder="t.ex. Grupp 11" aria-label="Grupp" />
          <SubmitButton pending="Lägger till…" className="btn btn-small">Lägg till</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2>Från Canvas</h2>
        <p>
          {p.canvas.name}
          {p.canvas.email && <span className="muted"> · {p.canvas.email}</span>}
        </p>
        <h3>Kurser och sektioner</h3>
        <ul className="plain">
          {p.canvas.courses.map((x) => (
            <li key={x.id}>
              <strong>{shortCode(x.course_code)}</strong> {x.name}
              <span className="muted"> · {x.sections.join(", ") || "–"}</span>
            </li>
          ))}
        </ul>
        <h3>Grupper</h3>
        <ul className="plain">
          {p.groups.map((g) => (
            <li key={g.id}>
              <details>
                <summary>
                  <strong>{g.name}</strong>
                  {g.course_id && <span className="muted"> · {shortCode(courseCode.get(g.course_id) ?? "")}</span>}
                  <span className="muted"> · {g.members.length} medlemmar</span>
                </summary>
                <p className="muted">{g.members.map((m) => m.name).join(", ")}</p>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
