/**
 * Steg 2: testa Canvas-hämtningen mot ditt eget konto.
 * Kör:  npm run canvas:test
 *
 * Skriver bara ut en sammanfattning i terminalen. Inget sparas, inget skickas
 * någon annanstans, och inget skrivs till Canvas.
 */
import {
  getActiveCourses,
  getAnnouncements,
  getAssignments,
  getGroupMembers,
  getMyGroups,
  getProfile,
  getTodo,
  getUpcomingEvents,
} from "../src/lib/canvas/api";
import { CanvasAuthError } from "../src/lib/canvas/client";

const strip = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  console.log("Hämtar profil…");
  const me = await getProfile();
  console.log(`  Inloggad som ${me.name} (${me.primary_email ?? me.login_id ?? "–"})\n`);

  console.log("Hämtar aktiva kurser…");
  const courses = await getActiveCourses();
  for (const c of courses) {
    const sections = c.sections?.map((s) => s.name).join(", ") || "–";
    console.log(`  [${c.id}] ${c.course_code} – ${c.name}`);
    console.log(`        sektioner: ${sections}`);
  }

  console.log("\nHämtar meddelanden (senaste 120 dagarna)…");
  const announcements = await getAnnouncements(courses.map((c) => c.id));
  const courseName = new Map(courses.map((c) => [`course_${c.id}`, c.course_code]));
  console.log(`  ${announcements.length} meddelanden totalt. De 5 senaste:`);
  for (const a of announcements.slice(0, 5)) {
    const date = (a.posted_at ?? a.created_at).slice(0, 10);
    console.log(`  ${date}  ${courseName.get(a.context_code)}  ${a.title}`);
    console.log(`        ${strip(a.message).slice(0, 120)}…`);
  }

  console.log("\nHämtar grupper…");
  const groups = await getMyGroups();
  for (const g of groups) {
    const members = await getGroupMembers(g.id);
    console.log(`  ${g.name}: ${members.map((m) => m.name).join(", ")}`);
  }
  if (groups.length === 0) console.log("  (inga grupper)");

  console.log("\nHämtar uppgifter med deadline…");
  const now = Date.now();
  for (const c of courses) {
    const upcoming = (await getAssignments(c.id)).filter(
      (a) => a.due_at && new Date(a.due_at).getTime() > now
    );
    for (const a of upcoming.slice(0, 3)) {
      const status = a.submission?.workflow_state ?? "?";
      console.log(`  ${a.due_at!.slice(0, 16).replace("T", " ")}  ${c.course_code}  ${a.name}  [${status}]`);
    }
  }

  const [events, todo] = await Promise.all([getUpcomingEvents(), getTodo()]);
  console.log(`\nKommande händelser: ${events.length}, att göra-poster: ${todo.length}`);
  console.log("\n✅ Canvas-hämtningen fungerar.");
}

main().catch((err) => {
  if (err instanceof CanvasAuthError) {
    console.error(`\n❌ ${err.message}`);
  } else {
    console.error("\n❌ Något gick fel:", err instanceof Error ? err.message : err);
  }
  process.exit(1);
});
