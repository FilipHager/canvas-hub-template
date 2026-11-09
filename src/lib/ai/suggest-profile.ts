import { completeJSON } from "./provider";

export interface ProfileSuggestion {
  program_code: string | null; // t.ex. "CMETE"
  program_name: string | null;
  year: number | null; // årskurs
  reasoning: string;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["program_code", "program_name", "year", "reasoning"],
  properties: {
    program_code: { type: ["string", "null"] },
    program_name: { type: ["string", "null"] },
    year: { type: ["integer", "null"] },
    reasoning: { type: "string" },
  },
};

/** Låter AI:n gissa program och årskurs utifrån kurser, sektioner och grupper. */
export function suggestProfile(canvasSummary: string): Promise<ProfileSuggestion> {
  return completeJSON<ProfileSuggestion>({
    name: "profile_suggestion",
    system: `Du hjälper en KTH-student att fylla i sin profil. Utifrån kurser, sektionsnamn och grupper:
gissa programkod (t.ex. CMETE), programnamn och årskurs. Sektionsnamn som "CMETE1" betyder ofta årskurs 1.
Kurser på basår (t.ex. TBASA, HF00xx) från tidigare terminer betyder att studenten gick basår innan programmet.
Om du är osäker, sätt null. reasoning: 1–2 meningar på svenska om varför, skrivet till studenten i du-form (aldrig han/hon/hen).`,
    user: canvasSummary,
    schema,
  });
}
