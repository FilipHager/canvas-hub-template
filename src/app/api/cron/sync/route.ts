/**
 * Schemalagd synk. Vercel Cron anropar den här adressen en gång per dygn.
 * Med CRON_SECRET satt krävs den (Vercel skickar den automatiskt). Utan den
 * körs synken bara om senaste synk är över 30 min gammal, så ingen kan
 * missbruka adressen till mer än en synk per halvtimme.
 */
import { timingSafeEqual } from "node:crypto";
import { ensureSchema } from "@/lib/db/schema";
import { runSync, syncIsStale } from "@/lib/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  await ensureSchema();
  if (process.env.CRON_SECRET) {
    if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  } else if (!(await syncIsStale(30))) {
    return new Response("Synkade nyss", { status: 429 });
  }
  try {
    const stats = await runSync();
    return Response.json({ ok: true, stats });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.name : "error" }, { status: 500 });
  }
}
