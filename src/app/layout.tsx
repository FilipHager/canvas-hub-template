import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { after } from "next/server";
import { isLoggedIn } from "@/auth";
import { query } from "@/lib/db";
import { daysFromToday, formatDate, formatLocal } from "@/lib/format";
import type { CustomProfile } from "@/lib/profile";
import { runSync, syncIsStale } from "@/lib/sync";
import { logout, syncNow } from "./actions";
import { SubmitButton } from "./components";
import "./globals.css";

export const metadata: Metadata = {
  title: "Canvas Hub",
  description: "Personlig översikt ovanpå KTH Canvas",
  icons: { icon: "/icons/favicon-32.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Canvas Hub", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2026" },
  ],
};

export const dynamic = "force-dynamic";
export const maxDuration = 300; // synk kan ta en stund första gången

async function lastSync() {
  const [run] = await query<{ status: string; error: string | null; finished_at: string | null }>(
    "select status, error, finished_at from sync_runs where finished_at is not null order by id desc limit 1"
  );
  return run ?? null;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const loggedIn = await isLoggedIn();

  // Inte inloggad (= inloggnings- eller installationssidan): visa bara sidan, inga data.
  if (!loggedIn) {
    return (
      <html lang="sv">
        <body>
          <main className="container">{children}</main>
        </body>
      </html>
    );
  }

  const run = await lastSync();
  const [prof] = await query<{ custom: CustomProfile }>("select custom from profile where id = 1");
  const expiring = [
    { name: "Canvas-token", date: prof?.custom?.canvas_token_expires, how: "Skapa en ny i Canvas (Konto → Inställningar → Ny åtkomsttoken)" },
    { name: "OpenAI-nyckeln", date: prof?.custom?.openai_key_expires, how: "Skapa en ny på platform.openai.com → API keys" },
  ]
    .filter((k) => k.date && daysFromToday(k.date) <= 14)
    .map((k) => ({ ...k, days: daysFromToday(k.date!) }));

  // Har det gått över en timme sedan senaste synk? Synka i bakgrunden efter att sidan skickats.
  if (await syncIsStale()) {
    after(() => runSync().catch(() => {}));
  }

  return (
    <html lang="sv">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/paminnelser" className="brand">Canvas Hub</Link>
            <nav>
              <Link href="/paminnelser">Påminnelser</Link>
              <Link href="/inkorg">Inkorg</Link>
              <Link href="/fraga">Fråga</Link>
              <Link href="/profil">Profil</Link>
            </nav>
            <form action={syncNow}>
              <SubmitButton pending="…" className="btn btn-small sync-btn">
                <span aria-hidden="true">↻</span><span className="sync-text"> Synka</span>
              </SubmitButton>
            </form>
          </div>
        </header>

        {expiring.map((k) => (
          <div key={k.name} className="banner banner-warn">
            <strong>
              {k.name} {k.days < 0 ? "har gått ut" : k.days === 0 ? "går ut idag" : `går ut om ${k.days} dagar`} ({formatLocal(k.date!)}).
            </strong>{" "}
            {k.how}, byt värdet i Vercel (Settings → Environment Variables → Redeploy) och ändra datumet under Profil.
          </div>
        ))}
        {run?.status === "auth_error" && (
          <div className="banner banner-error">
            <strong>Canvas-token har gått ut eller är fel.</strong> Skapa en ny i Canvas
            (Konto → Inställningar → Ny åtkomsttoken) och uppdatera <code>CANVAS_TOKEN</code>.
          </div>
        )}
        {run?.status === "ai_auth_error" && (
          <div className="banner banner-error">
            <strong>AI-nyckeln fungerar inte.</strong> Skapa en ny på platform.openai.com och uppdatera{" "}
            <code>OPENAI_API_KEY</code>.
          </div>
        )}
        {run?.status === "ai_quota" && (
          <div className="banner banner-warn">
            <strong>Din OpenAI-kredit är slut.</strong> Appen visar fortfarande dina deadlines och meddelanden
            från Canvas, men utan AI-sammanfattningar. Fyll på t.ex. $5 på{" "}
            <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noopener noreferrer">
              platform.openai.com → Billing
            </a>{" "}
            och tryck på ↻.
          </div>
        )}
        {run?.status === "error" && (
          <div className="banner banner-error">Senaste synken misslyckades: {run.error}</div>
        )}

        <main className="container">{children}</main>

        <footer className="footer">
          {run?.finished_at && <>Senast synkad {formatDate(run.finished_at, true)} · </>}
          <form action={logout} className="inline-form">
            <button type="submit" className="link-button">Logga ut</button>
          </form>
        </footer>
      </body>
    </html>
  );
}
