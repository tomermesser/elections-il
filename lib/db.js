import { neon } from "@neondatabase/serverless";
import { PICKS_CLOSE } from "./game.js";
import { newCode } from "./groups.js";

let sql, ready;

export async function db() {
  if (!sql && globalThis.__TEST_SQL__) sql = globalThis.__TEST_SQL__;
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    sql = neon(url);
  }
  if (!ready) ready = migrate().catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}

async function migrate() {
  await sql`create table if not exists settings (
    id int primary key default 1 check (id = 1),
    config jsonb not null default '{}'::jsonb,
    locked_at timestamptz,
    results jsonb
  )`;
  await sql`insert into settings (id) values (1) on conflict do nothing`;
  await sql`create table if not exists picks (
    email text primary key,
    name text not null,
    seats jsonb not null,
    blocs jsonb not null,
    turnout numeric(4,1) not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`;
  await sql`create unique index if not exists picks_name_uq on picks (lower(name))`;
  await sql`create table if not exists accounts (
    email text primary key,
    pin_hash text not null,
    failed int not null default 0,
    locked_until timestamptz,
    created_at timestamptz not null default now()
  )`;
  // Name + PIN sign-in (additive: existing rows keep display_name null until their owner signs in).
  await sql`alter table accounts add column if not exists display_name text`;
  await sql`create unique index if not exists accounts_name_uq on accounts (lower(display_name))`;

  // Groups (additive). Picks stay one per player; a group decides who appears on whose board.
  await sql`create table if not exists groups (
    id text primary key,
    name text not null,
    code text not null unique,
    created_by text,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists memberships (
    group_id text not null references groups(id) on delete cascade,
    member text not null,
    role text not null default 'member',
    joined_at timestamptz not null default now(),
    primary key (group_id, member)
  )`;
  await sql`create index if not exists memberships_member on memberships (member)`;
  // First run only: the original group "בחירות-26" gets everyone who already played or signed up.
  const seeded = await sql`insert into groups (id, name, code) values ('main', 'בחירות-26', ${newCode()})
                           on conflict do nothing returning id`;
  if (seeded.length) {
    await sql`insert into memberships (group_id, member) select 'main', email from picks on conflict do nothing`;
    await sql`insert into memberships (group_id, member) select 'main', 'pin:' || email from accounts on conflict do nothing`;
  }
}

/**
 * Who a display name belongs to: the account of a PIN user (by their pick or by their sign-in name),
 * or a Google user's pick. Returns { kind: "pin", key } | { kind: "google" } | null.
 */
export async function nameOwner(sql, name) {
  const [p] = await sql`select email from picks where lower(name) = lower(${name})`;
  if (p) return p.email.startsWith("pin:") ? { kind: "pin", key: p.email.slice(4) } : { kind: "google", id: p.email };
  const [a] = await sql`select email from accounts where lower(display_name) = lower(${name})`;
  return a ? { kind: "pin", key: a.email } : null;
}

/** Applies a passed deadline as a real lock, then returns the settings row. */
export async function settings(sql) {
  await sql`update settings set locked_at = (config->>'deadline')::timestamptz
            where id = 1 and locked_at is null and config->>'deadline' is not null
              and now() >= (config->>'deadline')::timestamptz`;
  await sql`update settings set locked_at = ${PICKS_CLOSE}::timestamptz
            where id = 1 and locked_at is null and now() >= ${PICKS_CLOSE}::timestamptz`;
  const [row] = await sql`select config, locked_at, results from settings where id = 1`;
  return row;
}
