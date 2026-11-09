const TZ = "Europe/Stockholm";

/** "mån 9 nov" eller "mån 9 nov 13:05" för en riktig tidpunkt (t.ex. publiceringsdatum). */
export function formatDate(iso: string | Date, withTime = false): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}

/**
 * AI:ns datum är svensk lokaltid utan tidszon ("2026-11-13" eller "2026-11-13T18:00").
 * Formatera dem som de är, utan tidszonsomräkning.
 */
export function formatLocal(local: string): string {
  const hasTime = local.includes("T");
  const d = new Date(local.slice(0, 16) + (hasTime ? ":00Z" : "T00:00:00Z"));
  if (Number.isNaN(d.getTime())) return local;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}

/** "DM1579 HT26 (11124)" → "DM1579" */
export const shortCode = (courseCode: string) => courseCode.split(" ")[0];

/** Riktig tidpunkt → svensk lokaltid "YYYY-MM-DDTHH:mm". */
export function toLocal(iso: string | Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(" ", "T");
}

/** Svensk lokaltid ("YYYY-MM-DD" eller "YYYY-MM-DDTHH:mm") → riktig tidpunkt. Datum utan tid = 23:59. */
export function fromLocal(local: string): Date {
  const [d, t = "23:59"] = local.slice(0, 16).split("T");
  const guess = new Date(`${d}T${t}:00Z`);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value; // t.ex. "GMT+01:00"
  const m = offset?.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - minutes * 60_000);
}

/** Dagens datum i Sverige, "YYYY-MM-DD". */
export const todayLocal = () => toLocal(new Date()).slice(0, 10);

/** Antal kalenderdagar från idag (svensk tid) till ett lokalt datum. */
export function daysFromToday(local: string): number {
  const utcDay = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utcDay(local) - utcDay(todayLocal())) / 86_400_000);
}

/** "om 3 h", "imorgon", "om 5 dagar", "för 2 dagar sedan". */
export function countdown(local: string): string {
  const days = daysFromToday(local);
  const hasTime = local.includes("T");
  if (days === 0) {
    if (!hasTime) return "idag";
    const mins = Math.round((fromLocal(local).getTime() - Date.now()) / 60_000);
    if (mins < 0) return "idag (passerat)";
    return mins < 60 ? `om ${mins} min` : `om ${Math.floor(mins / 60)} h`;
  }
  if (days === 1) return "imorgon";
  if (days === -1) return "igår";
  if (days < 0) return `för ${-days} dagar sedan`;
  if (days < 14) return `om ${days} dagar`;
  return `om ${Math.round(days / 7)} veckor`;
}

/** "DM1579 HT26 Media Production (11124)" → "Media Production" */
export const courseTitle = (name: string) =>
  name
    .replace(/^[A-Z]{2}\d{4}[A-Z]?\s+/, "")
    .replace(/^(HT|VT)\d{2}(\/(HT|VT)\d{2})?\s+/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
