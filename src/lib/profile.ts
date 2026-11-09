import { createHash } from "node:crypto";
import { query } from "./db";
import type { ProfileSuggestion } from "./ai/suggest-profile";

export interface CanvasProfileData {
  name: string;
  email: string | null;
  courses: { id: number; course_code: string; name: string; sections: string[] }[];
}

/** Det du själv fyller i på profilsidan. */
export interface CustomProfile {
  program_code?: string;
  program_name?: string;
  year?: number | null;
  confirmed?: boolean; // har du bekräftat AI:ns förslag?
  nickname?: string;
  specializations?: string;
  notes?: string;
  canvas_token_expires?: string; // "YYYY-MM-DD", du fyller i (Canvas visar det inte via API:t)
  openai_key_expires?: string;
}

export interface GroupRow {
  id: number;
  name: string;
  course_id: number | null;
  category: string | null;
  members: { id: number; name: string }[];
}

/** "Du är i labbgrupp X i kurs Y" – från Canvas (AI-tolkat) eller angivet av dig. */
export interface GroupFact {
  course_id: number;
  kind: string;
  label: string;
  source: "canvas" | "user";
  canvas_group_name: string | null;
}

export interface Profile {
  canvas: CanvasProfileData | null;
  ai_suggestion: ProfileSuggestion | null;
  custom: CustomProfile;
  groups: GroupRow[];
  facts: GroupFact[];
}

export const KIND_LABEL: Record<string, string> = {
  lab: "Labbgrupp",
  seminar: "Seminariegrupp",
  project: "Projektgrupp",
  class: "Klass",
  other: "Grupp",
};

export async function loadProfile(): Promise<Profile> {
  const [[row], groups, facts] = await Promise.all([
    query<{ canvas: CanvasProfileData; ai_suggestion: ProfileSuggestion | null; custom: CustomProfile }>(
      "select canvas, ai_suggestion, custom from profile where id = 1"
    ),
    query<GroupRow>("select id, name, course_id, category, members from groups order by name"),
    query<GroupFact>(
      "select course_id, kind, label, source, canvas_group_name from group_facts order by course_id, kind"
    ),
  ]);
  return {
    canvas: row?.canvas?.name ? row.canvas : null,
    ai_suggestion: row?.ai_suggestion ?? null,
    custom: row?.custom ?? {},
    // bigint-kolumner kommer som text från databasen
    groups: groups.map((g) => ({ ...g, id: Number(g.id), course_id: g.course_id === null ? null : Number(g.course_id) })),
    facts: facts.map((f) => ({ ...f, course_id: Number(f.course_id) })),
  };
}

/** Program/årskurs: det du bekräftat eller skrivit, annars AI:ns förslag. */
export function effectiveProgram(p: Profile) {
  const c = p.custom;
  const s = p.ai_suggestion;
  return {
    code: c.program_code || s?.program_code || null,
    name: c.program_name || s?.program_name || null,
    year: c.year ?? s?.year ?? null,
    confirmed: Boolean(c.confirmed),
  };
}

function generalContext(p: Profile): string[] {
  const prog = effectiveProgram(p);
  const lines = [
    `Namn: ${p.canvas?.name ?? "okänt"}${p.custom.nickname ? ` (kallas ${p.custom.nickname})` : ""}`,
    `Program: ${prog.code ?? "okänt"}${prog.name ? ` – ${prog.name}` : ""}${prog.confirmed ? "" : " (ej bekräftat)"}`,
    `Årskurs: ${prog.year ?? "okänd"}${prog.confirmed ? "" : " (ej bekräftad)"}`,
  ];
  if (p.custom.specializations) lines.push(`Inriktningar: ${p.custom.specializations}`);
  if (p.custom.notes) lines.push(`Studentens egna anteckningar: ${p.custom.notes}`);
  return lines;
}

/**
 * Profilen som text för AI:n, för en viss kurs: allmän info + bara den kursens
 * sektioner, grupper och gruppfakta. Då påverkar ett svar om din grupp i en kurs
 * bara analysen av den kursen. (E-post och gruppmedlemmar skickas inte.)
 */
export function courseContext(p: Profile, courseId: number): string {
  const course = p.canvas?.courses.find((c) => c.id === courseId);
  const groups = p.groups.filter((g) => g.course_id === courseId);
  const facts = p.facts.filter((f) => f.course_id === courseId);
  const lines = [
    ...generalContext(p),
    `Kursens sektioner för studenten: ${course?.sections.join(", ") || "–"}`,
    "Dina grupper i kursen:",
    ...(facts.length
      ? facts.map(
          (f) =>
            `  - ${KIND_LABEL[f.kind] ?? f.kind}: ${f.label}` +
            (f.source === "user" ? " (angivet av studenten)" : ` (från Canvas-gruppen "${f.canvas_group_name}")`)
        )
      : ["  - Inga kända labb-/seminariegrupper i den här kursen."]),
    ...groups.map((g) => `  - Canvas-grupp: "${g.name}"${g.category ? ` (kategori: ${g.category})` : ""}`),
  ];
  return lines.join("\n");
}

/** Översikt över hela profilen (för AI:ns gissning av program/årskurs). */
export function overviewContext(p: Profile): string {
  const courseCode = new Map(p.canvas?.courses.map((c) => [c.id, c.course_code]) ?? []);
  return [
    ...generalContext(p),
    "Kurser och sektioner:",
    ...(p.canvas?.courses ?? []).map((c) => `  - ${c.course_code}: ${c.name} [sektioner: ${c.sections.join(", ") || "–"}]`),
    "Canvas-grupper:",
    ...p.groups.map(
      (g) =>
        `  - "${g.name}"${g.category ? ` (kategori: ${g.category})` : ""}` +
        `${g.course_id ? ` i kurs ${courseCode.get(g.course_id) ?? g.course_id} [course_id=${g.course_id}]` : ""}`
    ),
  ].join("\n");
}

export const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);
