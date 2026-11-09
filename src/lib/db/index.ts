import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

/** Neon via Vercel sätter DATABASE_URL (äldre kopplingar: POSTGRES_URL). */
export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || null;

/** Databasanslutning (Neon via HTTP). Läser DATABASE_URL på servern. */
export function db() {
  if (!client) {
    const url = databaseUrl();
    if (!url) throw new Error("Databasen saknas: koppla Neon till projektet i Vercel (se README).");
    client = neon(url);
  }
  return client;
}

/**
 * Kör en SQL-fråga och returnerar raderna med rätt typ.
 * OBS: bigint-kolumner (t.ex. Canvas-id:n) kommer tillbaka som text – jämför med Number().
 */
export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await db().query(text, params)) as T[];
}
