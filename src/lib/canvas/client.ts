/**
 * Låg-nivå-klient mot Canvas REST API.
 *
 * Säkerhetsregler som den här filen garanterar:
 *  - Endast GET-anrop finns. Det finns ingen funktion för POST/PUT/DELETE,
 *    så appen kan aldrig skriva, posta eller lämna in något i Canvas.
 *  - Token läses från miljövariabel på servern och skickas bara till
 *    CANVAS_BASE_URL (även när vi följer pagineringslänkar).
 *  - Token skrivs aldrig ut i loggar eller felmeddelanden.
 */

if (typeof window !== "undefined") {
  throw new Error("Canvas-klienten får bara köras på servern.");
}

/** Kastas när Canvas svarar 401: token saknas, är fel eller har gått ut. */
export class CanvasAuthError extends Error {
  constructor() {
    super(
      "Canvas nekade åtkomst (401). Din Canvas-token har troligen gått ut eller är fel. " +
        "Skapa en ny token i Canvas (Konto → Inställningar → Ny åtkomsttoken) och uppdatera CANVAS_TOKEN."
    );
    this.name = "CanvasAuthError";
  }
}

export class CanvasError extends Error {
  constructor(
    public status: number,
    public path: string,
    detail: string
  ) {
    super(`Canvas svarade ${status} för ${path}: ${detail}`);
    this.name = "CanvasError";
  }
}

type QueryValue = string | number | boolean | Array<string | number>;
export type Query = Record<string, QueryValue | undefined>;

function config() {
  const token = process.env.CANVAS_TOKEN;
  const base = (process.env.CANVAS_BASE_URL ?? "https://canvas.kth.se").replace(/\/+$/, "");
  if (!token) {
    throw new Error("CANVAS_TOKEN saknas. Lägg in den i .env.local (se README).");
  }
  return { token, base, origin: new URL(base).origin };
}

function buildUrl(base: string, path: string, query: Query = {}): URL {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) url.searchParams.append(key, String(v));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/** Plockar ut rel="next" ur Canvas Link-header. */
function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_RETRIES = 4;

/**
 * Ett enda GET-anrop med omförsök vid rate limit (403 "Rate Limit Exceeded"
 * eller 429) och tillfälliga serverfel (5xx). Bromsar in i förväg när
 * Canvas kvot (X-Rate-Limit-Remaining) börjar ta slut.
 */
async function getOnce(url: URL): Promise<Response> {
  const { token, origin } = config();
  if (url.origin !== origin) {
    // Skydd: skicka aldrig token till någon annan värd än Canvas.
    throw new Error(`Vägrar anropa okänd värd: ${url.origin}`);
  }

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });

    if (res.status === 401) throw new CanvasAuthError();

    const remaining = Number(res.headers.get("x-rate-limit-remaining"));
    if (Number.isFinite(remaining) && remaining < 100) {
      await sleep(1000); // kvoten fylls på över tid; ta det lugnt
    }

    const body = res.ok ? "" : await res.clone().text();
    const rateLimited =
      res.status === 429 || (res.status === 403 && /rate limit/i.test(body));
    const transient = res.status >= 500;

    if ((rateLimited || transient) && attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 1000 + Math.random() * 500);
      continue;
    }

    if (!res.ok) {
      throw new CanvasError(res.status, url.pathname, body.slice(0, 300));
    }
    return res;
  }
}

/** Hämtar ett enskilt objekt, t.ex. /api/v1/users/self/profile. */
export async function canvasGet<T>(path: string, query?: Query): Promise<T> {
  const { base } = config();
  const res = await getOnce(buildUrl(base, path, query));
  return (await res.json()) as T;
}

/**
 * Hämtar en lista och följer paginering (Link: rel="next") tills allt är hämtat.
 * per_page=100 är max i Canvas och minimerar antalet anrop.
 */
export async function canvasGetAll<T>(path: string, query: Query = {}): Promise<T[]> {
  const { base } = config();
  let url: URL | null = buildUrl(base, path, { per_page: 100, ...query });
  const items: T[] = [];
  let pages = 0;

  while (url) {
    if (++pages > 50) break; // nödbroms mot oändliga loopar
    const res = await getOnce(url);
    const page = (await res.json()) as T[];
    items.push(...page);
    const next = nextLink(res.headers.get("link"));
    url = next ? new URL(next) : null;
  }
  return items;
}
