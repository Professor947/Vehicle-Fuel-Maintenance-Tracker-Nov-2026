/**
 * Runs the real migration on PGlite (Postgres in WASM) with minimal stand-ins for Supabase's
 * auth/storage schemas, then checks RLS, ownership triggers and server-stamped updated_at.
 * Run: npm run test:sql
 */
import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const STUBS = `
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`;
const GRANTS = `
grant usage on schema public, auth, storage to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
`;

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const V1 = '10000000-0000-0000-0000-000000000001';

async function setup() {
  const db = new PGlite();
  await db.exec(STUBS);
  const dir = new URL('../migrations/', import.meta.url);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  await db.exec(GRANTS);
  await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);
  return db;
}

async function as(db, uid, sql, params) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

const vehicleSql = `insert into public.vehicles (id, user_id, plate, plate_normalized, type, odometer_start, created_at, updated_at)
  values ($1, $2, 'LEA-1234', 'LEA1234', 'bike', 10000, '2020-01-01', '2020-01-01')`;

test('owner can insert and read; others cannot see it', async () => {
  const db = await setup();
  await as(db, A, vehicleSql, [V1, A]);
  assert.equal((await as(db, A, 'select * from public.vehicles')).rows.length, 1);
  assert.equal((await as(db, B, 'select * from public.vehicles')).rows.length, 0);
});

test('cannot insert rows for another user', async () => {
  const db = await setup();
  await assert.rejects(as(db, B, vehicleSql, [V1, A]), /row-level security/);
});

test('updated_at is stamped by the server; user_id cannot be changed', async () => {
  const db = await setup();
  await as(db, A, vehicleSql, [V1, A]);
  const r = await as(db, A, 'select updated_at, created_at from public.vehicles');
  assert.ok(new Date(r.rows[0].updated_at).getFullYear() > 2020, 'server time, not client value');
  assert.equal(new Date(r.rows[0].created_at).getFullYear(), 2020, 'client created_at kept');
  // Updating user_id to B would be blocked by RLS WITH CHECK... but the trigger pins it first.
  await as(db, A, `update public.vehicles set user_id = $1, make = 'x' where id = $2`, [B, V1]);
  const after = await as(db, A, 'select user_id, make from public.vehicles');
  assert.equal(after.rows[0].user_id, A);
  assert.equal(after.rows[0].make, 'x');
});

test('upsert (insert … on conflict do update) works under RLS', async () => {
  const db = await setup();
  const up = `${vehicleSql} on conflict (id) do update set make = 'Honda'`;
  await as(db, A, up, [V1, A]);
  await as(db, A, up, [V1, A]);
  assert.equal((await as(db, A, 'select make from public.vehicles')).rows[0].make, 'Honda');
  // B upserting A's id must not hijack it.
  await assert.rejects(as(db, B, up, [V1, B]), /row-level security|violates/);
});

test('child rows must reference a vehicle the user owns', async () => {
  const db = await setup();
  await as(db, A, vehicleSql, [V1, A]);
  const refuel = `insert into public.refuels (id, user_id, vehicle_id, "timestamp", odometer, litres, rate_per_litre, total_cost)
    values (gen_random_uuid(), $1, $2, now(), 10100, 5, 270, 1350)`;
  await as(db, A, refuel, [A, V1]);
  await assert.rejects(as(db, B, refuel, [B, V1]), /not owned/);
});

test('no hard deletes from clients (soft delete only)', async () => {
  const db = await setup();
  await as(db, A, vehicleSql, [V1, A]);
  await as(db, A, 'delete from public.vehicles');
  assert.equal((await as(db, A, 'select * from public.vehicles')).rows.length, 1);
});

test('check constraints reject bad data', async () => {
  const db = await setup();
  await as(db, A, vehicleSql, [V1, A]);
  const bad = `insert into public.refuels (id, user_id, vehicle_id, "timestamp", odometer, litres, rate_per_litre, total_cost)
    values (gen_random_uuid(), $1, $2, now(), 10100, 0, 270, 1350)`;
  await assert.rejects(as(db, A, bad, [A, V1]), /check constraint/);
});

test('storage: users can only write under their own folder', async () => {
  const db = await setup();
  await as(db, A, `insert into storage.objects (bucket_id, name) values ('photos', '${A}/vehicles/x/photo.jpg')`);
  await assert.rejects(
    as(db, A, `insert into storage.objects (bucket_id, name) values ('photos', '${B}/vehicles/x/photo.jpg')`),
    /row-level security/,
  );
  assert.equal((await as(db, B, 'select * from storage.objects')).rows.length, 0);
});
