-- FuelTrack initial schema. Mirrors src/db/schema.ts (device-only *_local_uri columns excluded).
-- Every table: client-generated uuid, owner user_id, soft delete, server-stamped updated_at
-- (pull cursor). RLS restricts every row to its owner.


-- updated_at is always the server's clock, so clients can pull with a reliable cursor.
create or replace function public.stamp_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;       -- ownership can never change
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

create table public.vehicles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  plate text not null,
  plate_normalized text not null,
  type text not null check (type in ('bike', 'car')),
  make text,
  model text,
  odometer_start double precision not null check (odometer_start >= 0),
  photo_path text,
  reg_card_photo_path text
);

create table public.odometer_readings (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  "timestamp" timestamptz not null,
  odometer double precision not null check (odometer >= 0),
  source text not null check (source in ('baseline', 'manual', 'refuel', 'service', 'ocr')),
  photo_path text
);

create table public.refuels (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  "timestamp" timestamptz not null,
  odometer double precision not null check (odometer >= 0),
  litres double precision not null check (litres > 0),
  rate_per_litre double precision not null check (rate_per_litre > 0),
  total_cost double precision not null check (total_cost > 0),
  station_name text,
  lat double precision,
  lng double precision,
  receipt_photo_path text,
  anomaly_cause text,
  anomaly_note text
);

create table public.service_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  type text not null check (type in ('oil', 'filter', 'chain_oil', 'general_service')),
  "timestamp" timestamptz not null,
  odometer double precision not null check (odometer >= 0),
  cost double precision check (cost is null or cost >= 0),
  notes text
);

create table public.reminder_rules (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  service_type text not null check (service_type in ('oil', 'filter', 'chain_oil', 'general_service')),
  interval_km double precision check (interval_km is null or interval_km > 0),
  interval_days integer check (interval_days is null or interval_days > 0),
  mode text not null default 'auto' check (mode in ('auto', 'custom')),
  enabled boolean not null default true
);

do $$
declare t text;
begin
  foreach t in array array['vehicles', 'odometer_readings', 'refuels', 'service_events', 'reminder_rules'] loop
    execute format('create trigger %I before insert or update on public.%I
                    for each row execute function public.stamp_updated_at()', t || '_stamp', t);
    execute format('create index %I on public.%I (user_id, updated_at, id)', t || '_pull_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_update', t);
    -- No DELETE policy: clients soft-delete (deleted_at) so deletions sync to other devices.
  end loop;
end $$;

-- Child rows must point at a vehicle owned by the same user.
create or replace function public.check_vehicle_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.user_id = new.user_id) then
    raise exception 'vehicle % not owned by user', new.vehicle_id using errcode = '42501';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['odometer_readings', 'refuels', 'service_events', 'reminder_rules'] loop
    execute format('create trigger %I before insert or update of vehicle_id, user_id on public.%I
                    for each row execute function public.check_vehicle_owner()', t || '_owner', t);
  end loop;
end $$;

-- Photos: private bucket, each user may only touch objects under "<their uid>/...".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "photos_select_own" on storage.objects for select
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_insert_own" on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_update_own" on storage.objects for update
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos_delete_own" on storage.objects for delete
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
