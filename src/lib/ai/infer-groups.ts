import { completeJSON } from "./provider";
import type { GroupKind } from "./analyze";

export interface InferredFact {
  course_id: number;
  kind: GroupKind;
  label: string; // kort gruppbeteckning som lärare använder, t.ex. "Group A" eller "Grupp 5"
  canvas_group_name: string;
}

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["facts"],
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["course_id", "kind", "label", "canvas_group_name"],
        properties: {
          course_id: { type: "integer" },
          kind: { type: "string", enum: ["lab", "seminar", "project", "class", "other"] },
          label: { type: "string" },
          canvas_group_name: { type: "string" },
        },
      },
    },
  },
};

/**
 * Läser ut "du är i labbgrupp X / seminariegrupp Y" ur dina Canvas-grupper
 * (gruppnamn + gruppkategori + kurs). Körs bara när dina grupper ändras.
 */
export async function inferGroupFacts(groupsText: string): Promise<InferredFact[]> {
  const res = await completeJSON<{ facts: InferredFact[] }>({
    name: "group_facts",
    system: `Du får en KTH-students grupper i Canvas: gruppnamn, gruppkategori och kurs.
Avgör för varje grupp vilken typ av grupp det är och vilken kort gruppbeteckning lärarna troligen använder i meddelanden.

- kind: "lab" (labbgrupp), "seminar" (seminariegrupp), "project" (projekt-/arbetsgrupp), "class" (klass/klassindelning) eller "other".
- Om kategorin gäller både labbar och seminarier (t.ex. "Labs and seminar groups"): skapa två poster, en "lab" och en "seminar", med samma label.
- label: den korta beteckningen, t.ex. "Group A Konsthallen" → "Group A", "Grupp 5" → "Grupp 5", "Labbgrupper, E-klassen 1" → "E-klassen grupp 1".
- canvas_group_name: gruppens exakta namn.
- Max en post per kurs och kind. Hoppa över grupper som uppenbart inte är undervisningsgrupper (t.ex. "Läser första året 5" om det bara är en intern markering) – välj då "other".`,
    user: groupsText,
    schema,
  });
  return res.facts;
}
