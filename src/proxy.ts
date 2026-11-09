/**
 * Spärren framför hela appen: körs före varje sida.
 * - Saknas inställningar → installationssidan /setup.
 * - Inte inloggad → /login.
 * - Första gången: skapar databastabellerna automatiskt.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/auth";
import { setupComplete } from "@/lib/config";
import { ensureSchema } from "@/lib/db/schema";

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const go = (to: string) => NextResponse.redirect(new URL(to, req.nextUrl.origin));

  if (!setupComplete()) return path === "/setup" ? NextResponse.next() : go("/setup");
  if (path === "/setup") return go("/login");

  const loggedIn = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!loggedIn) return path === "/login" ? NextResponse.next() : go("/login");
  if (path === "/login") return go("/paminnelser");

  await ensureSchema();
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/cron|_next/static|_next/image|icons/|manifest.webmanifest|favicon.ico).*)"],
};
