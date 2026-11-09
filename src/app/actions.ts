"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, SESSION_COOKIE } from "@/auth";
import { AIAuthError, AIQuotaError } from "@/lib/ai/provider";
import { answerQuestion } from "@/lib/chat";
import { query } from "@/lib/db";
import { runSync } from "@/lib/sync";
import type { CustomProfile } from "@/lib/profile";

// Server actions: körs på servern när du klickar på knappar i appen.
// Varje action kontrollerar själv att du är inloggad (utöver spärren i proxy.ts).

const KINDS = ["lab", "seminar", "project", "class", "other"];

async function syncQuietly() {
  try {
    await runSync();
  } catch {
    // Felet sparas i sync_runs och visas som en banner i appen.
  }
  revalidatePath("/", "layout");
}

export async function syncNow() {
  await requireUser();
  await syncQuietly();
}

export async function setRead(id: number, read: boolean) {
  await requireUser();
  await query("update announcements set read_at = $2 where id = $1", [id, read ? new Date().toISOString() : null]);
  revalidatePath("/inkorg");
}

export async function markAllRead() {
  await requireUser();
  await query("update announcements set read_at = now() where read_at is null");
  revalidatePath("/inkorg");
}

export async function setDone(reminderId: string, done: boolean) {
  await requireUser();
  await query(
    `insert into reminder_state (id, done_at) values ($1, $2)
     on conflict (id) do update set done_at = $2`,
    [reminderId.slice(0, 200), done ? new Date().toISOString() : null]
  );
  revalidatePath("/paminnelser");
}

/**
 * Sparar "jag är i grupp X" för en kurs och typ (från en påminnelse eller profilsidan)
 * och analyserar om den kursens meddelanden och uppgifter.
 */
export async function saveGroupFact(form: FormData) {
  await requireUser();
  const courseId = Number(form.get("course_id"));
  const kind = String(form.get("kind") ?? "");
  // Klick på en snabbknapp skickar "choice", annars används textfältet.
  const label = String(form.get("choice") || form.get("label") || "").trim().slice(0, 100);
  if (!Number.isInteger(courseId) || !KINDS.includes(kind) || !label) return;

  await query(
    `insert into group_facts (course_id, kind, label, source, canvas_group_name, updated_at)
     values ($1, $2, $3, 'user', null, now())
     on conflict (course_id, kind) do update set label = $3, source = 'user', canvas_group_name = null, updated_at = now()`,
    [courseId, kind, label]
  );
  await syncQuietly();
}

export async function deleteGroupFact(courseId: number, kind: string) {
  await requireUser();
  await query("delete from group_facts where course_id = $1 and kind = $2", [courseId, kind]);
  // Låt AI:n läsa ut grupperna från Canvas igen vid synken.
  await query("update profile set groups_hash = null where id = 1");
  await syncQuietly();
}

export async function saveProfile(form: FormData) {
  await requireUser();
  const text = (k: string) => String(form.get(k) ?? "").trim().slice(0, 2000);
  const year = Number(text("year"));
  const custom: CustomProfile = {
    program_code: text("program_code").toUpperCase(),
    program_name: text("program_name"),
    year: Number.isInteger(year) && year > 0 ? year : null,
    confirmed: true,
    nickname: text("nickname"),
    specializations: text("specializations"),
    notes: text("notes"),
    canvas_token_expires: /^\d{4}-\d{2}-\d{2}$/.test(text("canvas_token_expires")) ? text("canvas_token_expires") : "",
    openai_key_expires: /^\d{4}-\d{2}-\d{2}$/.test(text("openai_key_expires")) ? text("openai_key_expires") : "",
  };
  await query(
    `insert into profile (id, custom, updated_at) values (1, $1, now())
     on conflict (id) do update set custom = $1, updated_at = now()`,
    [JSON.stringify(custom)]
  );
  // Profilen påverkar AI:ns bedömning, så analysera om med den nya profilen.
  await syncQuietly();
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function askQuestion(history: { role: "user" | "assistant"; content: string }[]) {
  await requireUser();
  const clean = history
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!clean.length || clean.at(-1)!.role !== "user") return { error: "Ingen fråga." };
  try {
    return await answerQuestion(clean);
  } catch (err) {
    if (err instanceof AIAuthError || err instanceof AIQuotaError) return { error: err.message };
    return { error: "Något gick fel när AI:n skulle svara. Försök igen." };
  }
}
