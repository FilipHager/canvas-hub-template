/**
 * Kontrollerar att allt som behövs är inställt. Saknas något visas
 * installationssidan (/setup) i stället för appen.
 */
import { passwordConfigured } from "@/auth";
import { databaseUrl } from "@/lib/db";

export interface SetupItem {
  key: string;
  ok: boolean;
  title: string;
  help: string;
}

export function setupStatus(): SetupItem[] {
  return [
    {
      key: "DATABASE_URL",
      ok: Boolean(databaseUrl()),
      title: "Databas (Neon)",
      help: "Vercel → ditt projekt → Storage → Create Database → Neon → Connect. Gör sedan Redeploy.",
    },
    {
      key: "CANVAS_TOKEN",
      ok: Boolean(process.env.CANVAS_TOKEN),
      title: "Canvas-token",
      help: "Canvas → Konto → Inställningar → + Ny åtkomsttoken. Lägg in som CANVAS_TOKEN.",
    },
    {
      key: "OPENAI_API_KEY",
      ok: Boolean(process.env.OPENAI_API_KEY),
      title: "OpenAI-nyckel",
      help: "platform.openai.com → API keys → Create new secret key. Lägg in som OPENAI_API_KEY.",
    },
    {
      key: "APP_PASSWORD",
      ok: passwordConfigured(),
      title: "Lösenord till appen (minst 8 tecken)",
      help: "Hitta på ett lösenord och lägg in det som APP_PASSWORD.",
    },
  ];
}

export const setupComplete = () => setupStatus().every((s) => s.ok);
