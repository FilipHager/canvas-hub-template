/**
 * Enkel inloggning med ett lösenord (APP_PASSWORD) som du väljer när du installerar.
 * Inloggningen sparas i en signerad cookie i 30 dagar. Byter du lösenord loggas
 * alla ut automatiskt.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { databaseUrl } from "@/lib/db";

export const SESSION_COOKIE = "canvas_hub_session";
export const SESSION_DAYS = 30;

export const passwordConfigured = () => (process.env.APP_PASSWORD ?? "").length >= 8;

/** Nyckeln för att signera cookien: härleds ur lösenordet + databasadressen (båda hemliga). */
function signingKey() {
  return createHmac("sha256", "canvas-hub-session-v1")
    .update(`${process.env.APP_PASSWORD}\n${databaseUrl() ?? ""}`)
    .digest();
}

const signature = (expires: number) => createHmac("sha256", signingKey()).update(String(expires)).digest("base64url");

export function createSessionToken() {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  return `${expires}.${signature(expires)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token || !passwordConfigured()) return false;
  const [exp, sig] = token.split(".");
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < Date.now() || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(signature(expires));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Jämför lösenord utan att läcka information via tidsskillnader. */
export function passwordMatches(input: string) {
  const hashOf = (s: string) => createHash("sha256").update(s).digest();
  return passwordConfigured() && timingSafeEqual(hashOf(input), hashOf(process.env.APP_PASSWORD!));
}

export async function isLoggedIn() {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Kastar fel om ingen är inloggad. Används i alla server actions. */
export async function requireUser() {
  if (!(await isLoggedIn())) throw new Error("Inte inloggad");
}
