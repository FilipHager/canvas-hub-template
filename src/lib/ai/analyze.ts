import { completeJSON } from "./provider";

/** Höj när instruktionerna ändras, så analyseras allt om vid nästa synk. */
export const PROMPT_VERSION = "4";

export type Importance = "must_act" | "good_to_know" | "unimportant";
export type Relevance = "applies" | "not_applies" | "uncertain";
export type GroupKind = "lab" | "seminar" | "project" | "class" | "other";
export type TaskType = "deadline" | "exam" | "lab" | "seminar" | "lecture" | "meeting" | "other";

export interface GroupQuestion {
  kind: GroupKind;
  question: string; // t.ex. "Vilken seminariegrupp är du i i DM1578?"
  options: string[]; // t.ex. ["Grupp 11", "Grupp 12"]
}

export interface ExtractedTask {
  title: string;
  date: string | null; // "YYYY-MM-DD" eller "YYYY-MM-DDTHH:mm" (svensk tid)
  type: TaskType;
  location: string | null;
  group_info: string | null;
  my_group_name: string | null; // namnet på en av mina Canvas-grupper, om uppgiften gäller den
  preparations: string[]; // vad som ska göras/läsas/tas med innan
  group_question: GroupQuestion | null; // satt när uppgiften skiljer sig per grupp och min grupp är okänd
  relevance: Relevance;
  confidence: number; // 0–1
}

export interface AnnouncementAnalysis {
  summary: string;
  importance: Importance;
  relevance: Relevance;
  relevance_reason: string;
  my_group_details: string | null;
  tasks: ExtractedTask[];
}

export interface AssignmentAnalysis {
  items: ExtractedTask[];
}

const relevanceEnum = { type: "string", enum: ["applies", "not_applies", "uncertain"] };
const nullableString = { type: ["string", "null"] };

const taskSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "date", "type", "location", "group_info", "my_group_name",
    "preparations", "group_question", "relevance", "confidence",
  ],
  properties: {
    title: { type: "string" },
    date: { type: ["string", "null"], description: "YYYY-MM-DD eller YYYY-MM-DDTHH:mm i svensk tid." },
    type: { type: "string", enum: ["deadline", "exam", "lab", "seminar", "lecture", "meeting", "other"] },
    location: nullableString,
    group_info: nullableString,
    my_group_name: nullableString,
    preparations: { type: "array", items: { type: "string" } },
    group_question: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["kind", "question", "options"],
          properties: {
            kind: { type: "string", enum: ["lab", "seminar", "project", "class", "other"] },
            question: { type: "string" },
            options: { type: "array", items: { type: "string" } },
          },
        },
      ],
    },
    relevance: relevanceEnum,
    confidence: { type: "number" },
  },
};

const announcementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "importance", "relevance", "relevance_reason", "my_group_details", "tasks"],
  properties: {
    summary: { type: "string" },
    importance: { type: "string", enum: ["must_act", "good_to_know", "unimportant"] },
    relevance: relevanceEnum,
    relevance_reason: { type: "string" },
    my_group_details: nullableString,
    tasks: { type: "array", items: taskSchema },
  },
};

const assignmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: { items: { type: "array", items: taskSchema } },
};

const COMMON = `Skriv alltid till studenten i du-form ("du", "din grupp"). Använd aldrig han/hon/hen om studenten.

Studentens profil innehåller "Dina grupper i kursen" (t.ex. labbgrupp, seminariegrupp) – använd dem för att välja rätt tider och lokaler.

Regler för uppgifter (tasks/items):
- Konkreta saker med datum: inlämningar, tentor, labbar, seminarier, föreläsningar, möten, anmälningar.
- VIKTIGT: relativa ord ("idag", "imorgon", "på fredag") tolkas utifrån PUBLICERINGSDATUMET, aldrig dagens datum.
- Datum i svensk tid. Ta med klockslag om det finns.
- Om tider/lokaler/datum skiljer sig per grupp:
  - Om studentens grupp för den typen är känd: skapa uppgiften bara för studentens grupp, med rätt datum och lokal, och group_question = null.
  - Om studentens grupp INTE är känd: skapa EN uppgift med group_info som beskriver variationen (t.ex. "Grupp A: 11 nov, Grupp B: 12 nov"), relevance "uncertain", date = tidigaste datumet, och fyll i group_question: kind (lab/seminar/project/class/other), en kort fråga på svenska (t.ex. "Vilken labbgrupp är du i i DM1579?") och options = de gruppnamn som nämns (t.ex. ["Group A","Group B","Group C"]).
  - Annars group_question = null.
- preparations: korta punkter om vad studenten ska göra, läsa, titta på, installera eller ta med INNAN tillfället (t.ex. "Ta med egna hörlurar med minijack", "Titta på videon om bomstång"). Tom lista om inget sådant nämns.
- my_group_name: exakt namn på den av studentens Canvas-grupper som uppgiften gäller (gruppuppgifter), annars null.
- relevance: "not_applies" bara om det tydligt gäller en annan årskurs/program/grupp än studentens. Vid tvekan "uncertain".
- confidence: 0–1, hur säker du är på datum och detaljer.`;

const ANNOUNCEMENT_SYSTEM = `Du analyserar kursmeddelanden från KTH:s Canvas åt en student.

${COMMON}

Returnera också för själva meddelandet:
- summary: 1–2 korta meningar på svenska om vad studenten behöver veta. Nämn studentens tider/lokaler, inte andra gruppers.
- importance: "must_act" om studenten måste göra något (anmälan, inlämning, förberedelse, ta med något, ändrad tid/lokal för något hen deltar i). "good_to_know" för relevant information. "unimportant" för hälsningar, allmänna påminnelser utan nytt innehåll, eller sådant som inte gäller studenten.
- relevance för meddelandet:
  - "applies" om det gäller hela kursen eller studentens grupp/årskurs/sektion.
  - "not_applies" BARA om det tydligt riktar sig till en annan årskurs, annat program eller annan grupp (t.ex. "Till CMETE åk 3" när studenten går åk 1). Klass-/sektionskoder som CMAST1 eller CITEH1 betecknar andra program; matchar de inte studentens program/sektioner: "not_applies".
  - "uncertain" om du inte säkert kan avgöra det.
- relevance_reason: kort motivering, max 1 mening.
- my_group_details: om meddelandet har olika info per grupp och studentens grupp är känd: bara det som gäller studentens grupp. Annars null.`;

const ASSIGNMENT_SYSTEM = `Du analyserar en uppgift ("assignment") från KTH:s Canvas åt en student och gör om den till påminnelser.

${COMMON}

Skapa:
- Om uppgiften är kopplad till ett schemalagt tillfälle (labb, seminarium, redovisning) med datum per grupp: en påminnelse för tillfället (type lab/seminar/…) med studentens datum och lokal.
- En påminnelse för inlämningen (type "deadline") om det finns en deadline. Använd Canvas-deadline om inget annat anges.
- Lägg förberedelser (preparations) på tillfället om det finns ett, annars på deadlinen.
- Normalt 1–2 påminnelser. Titlar korta och tydliga på svenska.`;

/** "måndag 2026-11-09 13:05" i svensk tid. */
const stockholm = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm", weekday: "long", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(d);

const today = () => `DAGENS DATUM (bara för sammanhang, använd INTE för att tolka "idag"/"imorgon"): ${stockholm(new Date())}`;

export interface AnalyzeInput {
  profileContext: string;
  courseCode: string;
  courseName: string;
  title: string;
  text: string;
  postedAt: string;
  author: string | null;
}

export function analyzeAnnouncement(input: AnalyzeInput): Promise<AnnouncementAnalysis> {
  const user = `STUDENTENS PROFIL:
${input.profileContext}

${today()}

MEDDELANDE
Kurs: ${input.courseCode} – ${input.courseName}
Publicerat: ${stockholm(new Date(input.postedAt))} (svensk tid)
Avsändare: ${input.author ?? "okänd"}
Rubrik: ${input.title}

${input.text.slice(0, 12000)}`;

  return completeJSON<AnnouncementAnalysis>({
    name: "announcement_analysis",
    system: ANNOUNCEMENT_SYSTEM,
    user,
    schema: announcementSchema,
  });
}

export interface AssignmentInput {
  profileContext: string;
  courseCode: string;
  courseName: string;
  name: string;
  description: string;
  dueAt: string | null;
}

export function analyzeAssignment(input: AssignmentInput): Promise<AssignmentAnalysis> {
  const user = `STUDENTENS PROFIL:
${input.profileContext}

${today()}

UPPGIFT
Kurs: ${input.courseCode} – ${input.courseName}
Namn: ${input.name}
Canvas-deadline: ${input.dueAt ? stockholm(new Date(input.dueAt)) + " (svensk tid)" : "ingen"}

Beskrivning:
${input.description.slice(0, 8000) || "(ingen beskrivning)"}`;

  return completeJSON<AssignmentAnalysis>({
    name: "assignment_analysis",
    system: ASSIGNMENT_SYSTEM,
    user,
    schema: assignmentSchema,
  });
}
