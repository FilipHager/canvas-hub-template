"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_DAYS } from "@/auth";
import { query } from "@/lib/db";
import { ensureSchema } from "@/lib/db/schema";

const MAX_FAILS = 10; // per 15 minuter

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  await ensureSchema();
  const [{ fails }] = await query<{ fails: number }>(
    "select count(*)::int as fails from login_attempts where at > now() - interval '15 minutes'"
  );
  if (fails >= MAX_FAILS) return "För många felaktiga försök. Vänta 15 minuter och försök igen.";

  const password = String(form.get("password") ?? "");
  if (!passwordMatches(password)) {
    await query("insert into login_attempts default values");
    await query("delete from login_attempts where at < now() - interval '1 day'");
    return "Fel lösenord.";
  }

  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect("/paminnelser");
}
