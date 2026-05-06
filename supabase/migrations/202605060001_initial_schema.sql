begin;

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$
begin
  create type public.app_role as enum ('admin', 'client');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.skill_level as enum ('beginner', 'intermediate', 'advanced');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.hold_status as enum ('active', 'expired', 'converted', 'released');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  first_name text,
  last_name text,
  email text not null unique,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  athlete_name text not null,
  athlete_age integer check (athlete_age is null or athlete_age between 4 and 100),
  skill_level public.skill_level,
  primary_position text,
  guardian_name text,
  guardian_email text,
  waiver_signed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  default_duration_minutes integer not null default 60 check (default_duration_minutes > 0),
  hourly_rate numeric(10, 2) not null default 30.00 check (hourly_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'America/Chicago',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create table if not exists public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  exception_type text not null check (exception_type in ('blocked', 'open')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  training_type_id uuid not null references public.training_types(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  expires_at timestamptz not null,
  status public.hold_status not null default 'active',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (expires_at > created_at)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  training_type_id uuid not null references public.training_types(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'pending',
  notes text,
  google_calendar_event_id text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

do $$
begin
  alter table public.bookings
    add constraint bookings_no_overlap
    exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
    where (status in ('pending', 'confirmed'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  storage_path text,
  external_url text,
  visible_to_all boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_clients_updated_at on public.clients;
create trigger touch_clients_updated_at
before update on public.clients
for each row execute function public.touch_updated_at();

drop trigger if exists touch_training_types_updated_at on public.training_types;
create trigger touch_training_types_updated_at
before update on public.training_types
for each row execute function public.touch_updated_at();

drop trigger if exists touch_availability_windows_updated_at on public.availability_windows;
create trigger touch_availability_windows_updated_at
before update on public.availability_windows
for each row execute function public.touch_updated_at();

drop trigger if exists touch_availability_exceptions_updated_at on public.availability_exceptions;
create trigger touch_availability_exceptions_updated_at
before update on public.availability_exceptions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_bookings_updated_at on public.bookings;
create trigger touch_bookings_updated_at
before update on public.bookings
for each row execute function public.touch_updated_at();

drop trigger if exists touch_resources_updated_at on public.resources;
create trigger touch_resources_updated_at
before update on public.resources
for each row execute function public.touch_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin'
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.training_types enable row level security;
alter table public.availability_windows enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.booking_holds enable row level security;
alter table public.bookings enable row level security;
alter table public.resources enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "clients_admin_all" on public.clients;
create policy "clients_admin_all"
on public.clients for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "clients_owner_read_write" on public.clients;
create policy "clients_owner_read_write"
on public.clients for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "training_types_public_read_active" on public.training_types;
create policy "training_types_public_read_active"
on public.training_types for select
using (active = true or public.is_admin());

drop policy if exists "training_types_admin_all" on public.training_types;
create policy "training_types_admin_all"
on public.training_types for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "availability_windows_public_read_active" on public.availability_windows;
create policy "availability_windows_public_read_active"
on public.availability_windows for select
using (active = true or public.is_admin());

drop policy if exists "availability_windows_admin_all" on public.availability_windows;
create policy "availability_windows_admin_all"
on public.availability_windows for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "availability_exceptions_public_read" on public.availability_exceptions;
create policy "availability_exceptions_public_read"
on public.availability_exceptions for select
using (true);

drop policy if exists "availability_exceptions_admin_all" on public.availability_exceptions;
create policy "availability_exceptions_admin_all"
on public.availability_exceptions for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "booking_holds_owner_or_admin" on public.booking_holds;
create policy "booking_holds_owner_or_admin"
on public.booking_holds for all
using (created_by = auth.uid() or public.is_admin())
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "bookings_owner_or_admin_read" on public.bookings;
create policy "bookings_owner_or_admin_read"
on public.bookings for select
using (
  created_by = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.clients
    where clients.id = bookings.client_id
      and clients.user_id = auth.uid()
  )
);

drop policy if exists "bookings_authenticated_insert" on public.bookings;
create policy "bookings_authenticated_insert"
on public.bookings for insert
with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "bookings_admin_update_delete" on public.bookings;
create policy "bookings_admin_update_delete"
on public.bookings for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "resources_client_read_visible" on public.resources;
create policy "resources_client_read_visible"
on public.resources for select
using (visible_to_all = true or public.is_admin());

drop policy if exists "resources_admin_all" on public.resources;
create policy "resources_admin_all"
on public.resources for all
using (public.is_admin())
with check (public.is_admin());

insert into public.training_types (name, description, default_duration_minutes, hourly_rate)
values
  ('Batting', 'Swing mechanics, approach, tee work, front toss, and live reps.', 60, 30.00),
  ('Pitching', 'Command, mechanics, pitch design, and mound routines.', 60, 30.00),
  ('Defense/Infield', 'Footwork, glove work, transfers, angles, and game-speed reads.', 60, 30.00),
  ('Defense/Outfield', 'Routes, reads, first step, throwing, and communication.', 60, 30.00),
  ('Other', 'Custom private training session.', 60, 30.00)
on conflict (name) do nothing;

insert into storage.buckets (id, name, public)
values ('training-resources', 'training-resources', false)
on conflict (id) do nothing;

drop policy if exists "training_resources_admin_all" on storage.objects;
create policy "training_resources_admin_all"
on storage.objects for all
using (bucket_id = 'training-resources' and public.is_admin())
with check (bucket_id = 'training-resources' and public.is_admin());

drop policy if exists "training_resources_authenticated_read" on storage.objects;
create policy "training_resources_authenticated_read"
on storage.objects for select
using (bucket_id = 'training-resources' and auth.role() = 'authenticated');

commit;
