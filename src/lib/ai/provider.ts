/**
 * Den enda filen som pratar med en AI-leverantör. Resten av appen anropar
 * bara completeJSON(). Vill du byta leverantör (t.ex. till Claude) lägger du
 * till en gren här och sätter AI_PROVIDER i .env.local.
 */

export class AIAuthError extends Error {
  constructor() {
    super(
      "AI-leverantören nekade nyckeln (401). Nyckeln har gått ut eller är fel. " +
        "Skapa en ny på platform.openai.com → API keys och uppdatera OPENAI_API_KEY."
    );
    this.name = "AIAuthError";
  }
}

/** OpenAI-krediten är slut (429 insufficient_quota). */
export class AIQuotaError extends Error {
  constructor() {
    super("Din OpenAI-kredit är slut. Fyll på på platform.openai.com → Billing.");
    this.name = "AIQuotaError";
  }
}

export interface JSONRequest {
  name: string; // kort namn på schemat, t.ex. "announcement_analysis"
  system: string;
  user: string;
  schema: Record<string, unknown>; // JSON Schema (strict)
}

export const AI_MODEL = process.env.AI_MODEL ?? "gpt-5.4-mini";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function completeJSON<T>(req: JSONRequest): Promise<T> {
  const provider = process.env.AI_PROVIDER ?? "openai";
  if (provider !== "openai") throw new Error(`AI_PROVIDER=${provider} stöds inte än.`);

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY saknas i .env.local.");

  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: req.name, strict: true, schema: req.schema },
        },
      }),
    });

    if (res.status === 401) throw new AIAuthError();
    if (res.status === 429) {
      const body = await res.clone().json().catch(() => null);
      if (body?.error?.code === "insufficient_quota") throw new AIQuotaError();
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(2 ** attempt * 1500);
      continue;
    }
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`OpenAI svarade ${res.status}: ${json?.error?.message ?? "okänt fel"}`);
    }
    const content: string | null = json.choices?.[0]?.message?.content ?? null;
    if (!content) throw new Error("OpenAI returnerade inget innehåll (kan ha vägrat svara).");
    return JSON.parse(content) as T;
  }
}
