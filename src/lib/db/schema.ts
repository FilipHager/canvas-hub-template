/**
 * Databasschemat. Skapas automatiskt första gången appen används
 * (ensureSchema) – ingen behöver köra något kommando.
 * Alla satser är idempotenta, så det går att köra flera gånger.
 */
import { db, query } from "./index";

export const SCHEMA = `-- Databasschema för Canvas Hub. Körs med \`npm run db:migrate\`.
-- Alla satser är idempotenta (går att köra flera gånger).

create table if not exists courses (
  id          bigint primary key,
  name        text not null,
  course_code text not null,
  sections    jsonb not null default '[]',
  term        jsonb,
  hidden      boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table if not exists announcements (
  id           bigint primary key,
  course_id    bigint not null,
  title        text not null,
  message_html text not null,
  message_text text not null,
  author       text,
  posted_at    timestamptz not null,
  html_url     text not null,
  content_hash text not null,
  read_at      timestamptz,
  fetched_at   timestamptz not null default now()
);
create index if not exists announcements_posted_idx on announcements (posted_at desc);

-- AI-cache: ett resultat per meddelande. Analyseras bara om när innehållet
-- (content_hash) eller din profil (profile_hash) har ändrats.
create table if not exists analyses (
  announcement_id bigint primary key references announcements(id) on delete cascade,
  content_hash    text not null,
  profile_hash    text not null,
  model           text not null,
  result          jsonb not null,
  created_at      timestamptz not null default now()
);

create table if not exists groups (
  id         bigint primary key,
  name       text not null,
  course_id  bigint,
  members    jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

-- En enda rad (id = 1): din profil.
create table if not exists profile (
  id            int primary key default 1 check (id = 1),
  canvas        jsonb not null default '{}',  -- hämtat automatiskt
  ai_suggestion jsonb,                        -- AI:ns förslag på program/årskurs
  custom        jsonb not null default '{}',  -- det du själv fyller i/bekräftar
  updated_at    timestamptz not null default now()
);

create table if not exists sync_runs (
  id          serial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running', -- running | ok | error | auth_error
  error       text,
  stats       jsonb
);

-- ---- Steg 5: påminnelser och grupper ----

alter table groups add column if not exists category text;
alter table profile add column if not exists groups_hash text;

-- Canvas-uppgifter (inlämningar m.m.) med din inlämningsstatus.
create table if not exists assignments (
  id               bigint primary key,
  course_id        bigint not null,
  name             text not null,
  description_text text not null default '',
  due_at           timestamptz,
  html_url         text not null,
  submission_state text,
  submitted_at     timestamptz,
  missing          boolean not null default false,
  content_hash     text not null,
  updated_at       timestamptz not null default now()
);

-- AI-cache för uppgifter (samma princip som för meddelanden).
create table if not exists assignment_analyses (
  assignment_id bigint primary key references assignments(id) on delete cascade,
  content_hash  text not null,
  profile_hash  text not null,
  model         text not null,
  result        jsonb not null,
  created_at    timestamptz not null default now()
);

-- Vilken grupp du är i per kurs och typ (labb, seminarium …).
-- source = 'canvas' (AI:n läste ut det ur Canvas-grupperna) eller 'user' (du angav det).
create table if not exists group_facts (
  course_id         bigint not null,
  kind              text not null,
  label             text not null,
  source            text not null,
  canvas_group_name text,
  updated_at        timestamptz not null default now(),
  primary key (course_id, kind)
);

-- Påminnelser du har bockat av som klara.
create table if not exists reminder_state (
  id      text primary key,
  done_at timestamptz
);

-- Misslyckade inloggningsförsök (skydd mot gissning).
create table if not exists login_attempts (
  id serial primary key,
  at timestamptz not null default now()
);
`;

export const statements = () =>
  SCHEMA.split(/;\s*$/m)
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter(Boolean);

// Ändra den här när schemat får en ny tabell, så uppdateras befintliga installationer.
const NEWEST_TABLE = "login_attempts";

let ready: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const [row] = await query<{ ok: boolean }>(`select to_regclass('public.${NEWEST_TABLE}') is not null as ok`);
    if (row?.ok) return;
    for (const s of statements()) await db().query(s);
  })().catch((err) => {
    ready = null; // försök igen nästa gång
    throw err;
  });
  return ready;
}
