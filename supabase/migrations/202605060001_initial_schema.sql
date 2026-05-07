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
  create type public.skill_level as enum ('beginner', 'intermediate', 'advanced', 'all');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.booking_status as enum (
    'hold',
    'pending',
    'confirmed',
    'cancelled',
    'completed',
    'no_show',
    'rescheduled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.availability_exception_type as enum ('blocked', 'special_opening');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.resource_type as enum ('video', 'pdf', 'image', 'link', 'text');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.resource_visibility as enum ('all_clients', 'booked_clients', 'admin_only');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.booking_audit_action as enum (
    'created',
    'confirmed',
    'cancelled',
    'rescheduled',
    'completed',
    'no_show',
    'updated',
    'calendar_synced'
  );
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
  skill_level public.skill_level check (skill_level is null or skill_level <> 'all'),
  primary_position text,
  guardian_name text,
  guardian_email text,
  emergency_contact_name text,
  emergency_contact_phone text,
  waiver_signed_at timestamptz,
  media_consent_at timestamptz,
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
  exception_type public.availability_exception_type not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete set null,
  coach_id uuid not null references public.profiles(id),
  training_type_id uuid not null references public.training_types(id),
  other_training_text text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'pending',
  price numeric(10, 2) not null default 30.00 check (price >= 0),
  notes text,
  google_calendar_event_id text,
  cancellation_reason text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at),
  check (
    cancellation_reason is null
    or status in ('cancelled', 'rescheduled')
  )
);

do $$
begin
  alter table public.bookings
    add constraint bookings_confirmed_no_coach_overlap
    exclude using gist (
      coach_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
    where (status = 'confirmed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.session_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  coach_id uuid not null references public.profiles(id),
  private_notes text,
  client_visible_summary text,
  homework text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id)
);

create table if not exists public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.resource_categories(id) on delete set null,
  title text not null,
  description text,
  skill_level public.skill_level not null default 'all',
  session_type text,
  resource_type public.resource_type not null,
  visibility public.resource_visibility not null default 'all_clients',
  storage_path text,
  external_url text,
  body text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (resource_type in ('video', 'pdf', 'image') and storage_path is not null)
    or (resource_type = 'link' and external_url is not null)
    or (resource_type = 'text' and body is not null)
  )
);

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'google',
  calendar_id text not null,
  calendar_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, provider, calendar_id),
  check (provider in ('google'))
);

create table if not exists public.booking_audit_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action public.booking_audit_action not null,
  previous_status public.booking_status,
  new_status public.booking_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
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
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.is_profile_admin(profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = profile_id
      and role = 'admin'
  )
$$;

create or replace function public.is_booked_client(resource_row public.resources)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.bookings b
    join public.clients c on c.id = b.client_id
    where c.user_id = auth.uid()
      and b.status in ('confirmed', 'completed')
      and (
        resource_row.session_type is null
        or resource_row.session_type = ''
        or exists (
          select 1
          from public.training_types tt
          where tt.id = b.training_type_id
            and tt.name = resource_row.session_type
        )
      )
  )
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

create or replace function public.log_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_audit_logs (
      booking_id,
      actor_id,
      action,
      new_status,
      metadata
    )
    values (
      new.id,
      new.created_by,
      'created',
      new.status,
      jsonb_build_object('starts_at', new.starts_at, 'ends_at', new.ends_at)
    );
  elsif new.status is distinct from old.status then
    insert into public.booking_audit_logs (
      booking_id,
      actor_id,
      action,
      previous_status,
      new_status,
      metadata
    )
    values (
      new.id,
      auth.uid(),
      case
        when new.status = 'confirmed' then 'confirmed'::public.booking_audit_action
        when new.status = 'cancelled' then 'cancelled'::public.booking_audit_action
        when new.status = 'rescheduled' then 'rescheduled'::public.booking_audit_action
        when new.status = 'completed' then 'completed'::public.booking_audit_action
        when new.status = 'no_show' then 'no_show'::public.booking_audit_action
        else 'updated'::public.booking_audit_action
      end,
      old.status,
      new.status,
      jsonb_build_object('starts_at', new.starts_at, 'ends_at', new.ends_at)
    );
  elsif new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.coach_id is distinct from old.coach_id
    or new.training_type_id is distinct from old.training_type_id then
    insert into public.booking_audit_logs (
      booking_id,
      actor_id,
      action,
      previous_status,
      new_status,
      metadata
    )
    values (
      new.id,
      auth.uid(),
      'updated',
      old.status,
      new.status,
      jsonb_build_object(
        'old_starts_at', old.starts_at,
        'new_starts_at', new.starts_at,
        'old_ends_at', old.ends_at,
        'new_ends_at', new.ends_at,
        'old_coach_id', old.coach_id,
        'new_coach_id', new.coach_id
      )
    );
  end if;

  return new;
end;
$$;

create or replace function public.validate_coach_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_profile_admin(new.coach_id) then
    raise exception 'coach_id must reference an admin profile';
  end if;

  return new;
end;
$$;

create or replace function public.validate_booking_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  training_type_name text;
begin
  if not public.is_profile_admin(new.coach_id) then
    raise exception 'coach_id must reference an admin profile';
  end if;

  select name
  into training_type_name
  from public.training_types
  where id = new.training_type_id;

  if training_type_name = 'Other'
    and nullif(btrim(coalesce(new.other_training_text, '')), '') is null then
    raise exception 'other_training_text is required when training type is Other';
  end if;

  return new;
end;
$$;

create or replace function public.validate_session_note_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  booking_client_id uuid;
  booking_coach_id uuid;
begin
  if not public.is_profile_admin(new.coach_id) then
    raise exception 'coach_id must reference an admin profile';
  end if;

  select client_id, coach_id
  into booking_client_id, booking_coach_id
  from public.bookings
  where id = new.booking_id;

  if found and (
    new.client_id is distinct from booking_client_id
    or new.coach_id is distinct from booking_coach_id
  ) then
    raise exception 'session note client_id and coach_id must match the booking';
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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

drop trigger if exists validate_availability_windows_coach on public.availability_windows;
create trigger validate_availability_windows_coach
before insert or update of coach_id on public.availability_windows
for each row execute function public.validate_coach_profile();

drop trigger if exists touch_availability_exceptions_updated_at on public.availability_exceptions;
create trigger touch_availability_exceptions_updated_at
before update on public.availability_exceptions
for each row execute function public.touch_updated_at();

drop trigger if exists validate_availability_exceptions_coach on public.availability_exceptions;
create trigger validate_availability_exceptions_coach
before insert or update of coach_id on public.availability_exceptions
for each row execute function public.validate_coach_profile();

drop trigger if exists touch_bookings_updated_at on public.bookings;
create trigger touch_bookings_updated_at
before update on public.bookings
for each row execute function public.touch_updated_at();

drop trigger if exists validate_bookings_consistency on public.bookings;
create trigger validate_bookings_consistency
before insert or update of coach_id, training_type_id, other_training_text on public.bookings
for each row execute function public.validate_booking_consistency();

drop trigger if exists booking_audit_status_change on public.bookings;
create trigger booking_audit_status_change
after insert or update on public.bookings
for each row execute function public.log_booking_status_change();

drop trigger if exists touch_session_notes_updated_at on public.session_notes;
create trigger touch_session_notes_updated_at
before update on public.session_notes
for each row execute function public.touch_updated_at();

drop trigger if exists validate_session_notes_consistency on public.session_notes;
create trigger validate_session_notes_consistency
before insert or update of booking_id, client_id, coach_id on public.session_notes
for each row execute function public.validate_session_note_consistency();

drop trigger if exists touch_resource_categories_updated_at on public.resource_categories;
create trigger touch_resource_categories_updated_at
before update on public.resource_categories
for each row execute function public.touch_updated_at();

drop trigger if exists touch_resources_updated_at on public.resources;
create trigger touch_resources_updated_at
before update on public.resources
for each row execute function public.touch_updated_at();

drop trigger if exists touch_calendar_connections_updated_at on public.calendar_connections;
create trigger touch_calendar_connections_updated_at
before update on public.calendar_connections
for each row execute function public.touch_updated_at();

drop trigger if exists validate_calendar_connections_coach on public.calendar_connections;
create trigger validate_calendar_connections_coach
before insert or update of coach_id on public.calendar_connections
for each row execute function public.validate_coach_profile();

create index if not exists profiles_role_idx
  on public.profiles (role);

create index if not exists clients_user_id_idx
  on public.clients (user_id);

create index if not exists clients_guardian_email_idx
  on public.clients (guardian_email);

create index if not exists training_types_active_idx
  on public.training_types (active, name);

create index if not exists availability_windows_coach_day_idx
  on public.availability_windows (coach_id, day_of_week, active);

create index if not exists availability_exceptions_coach_range_idx
  on public.availability_exceptions using gist (
    coach_id,
    tstzrange(starts_at, ends_at, '[)')
  );

create index if not exists bookings_client_starts_at_idx
  on public.bookings (client_id, starts_at);

create index if not exists bookings_coach_starts_at_idx
  on public.bookings (coach_id, starts_at);

create index if not exists bookings_status_starts_at_idx
  on public.bookings (status, starts_at);

create index if not exists bookings_training_type_idx
  on public.bookings (training_type_id);

create index if not exists session_notes_booking_id_idx
  on public.session_notes (booking_id);

create index if not exists session_notes_client_id_idx
  on public.session_notes (client_id);

create index if not exists session_notes_coach_id_idx
  on public.session_notes (coach_id);

create index if not exists resource_categories_active_sort_idx
  on public.resource_categories (active, sort_order, name);

create index if not exists resources_category_id_idx
  on public.resources (category_id);

create index if not exists resources_visibility_idx
  on public.resources (visibility);

create index if not exists resources_skill_level_idx
  on public.resources (skill_level);

create index if not exists calendar_connections_coach_active_idx
  on public.calendar_connections (coach_id, active);

create index if not exists booking_audit_logs_booking_created_idx
  on public.booking_audit_logs (booking_id, created_at desc);

create index if not exists booking_audit_logs_actor_created_idx
  on public.booking_audit_logs (actor_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.training_types enable row level security;
alter table public.availability_windows enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings enable row level security;
alter table public.session_notes enable row level security;
alter table public.resource_categories enable row level security;
alter table public.resources enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.booking_audit_logs enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
on public.profiles for insert
with check (public.is_admin());

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

drop policy if exists "bookings_owner_or_admin_read" on public.bookings;
create policy "bookings_owner_or_admin_read"
on public.bookings for select
using (
  public.is_admin()
  or coach_id = auth.uid()
  or created_by = auth.uid()
  or exists (
    select 1
    from public.clients
    where clients.id = bookings.client_id
      and clients.user_id = auth.uid()
  )
);

drop policy if exists "bookings_authenticated_insert" on public.bookings;
create policy "bookings_authenticated_insert"
on public.bookings for insert
with check (
  auth.role() = 'authenticated'
  and (
    public.is_admin()
    or created_by = auth.uid()
  )
);

drop policy if exists "bookings_owner_cancel" on public.bookings;
create policy "bookings_owner_cancel"
on public.bookings for update
using (
  status in ('hold', 'pending', 'confirmed')
  and exists (
    select 1
    from public.clients
    where clients.id = bookings.client_id
      and clients.user_id = auth.uid()
  )
)
with check (
  status in ('cancelled', 'rescheduled')
  and exists (
    select 1
    from public.clients
    where clients.id = bookings.client_id
      and clients.user_id = auth.uid()
  )
);

drop policy if exists "bookings_admin_all" on public.bookings;
create policy "bookings_admin_all"
on public.bookings for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "session_notes_admin_all" on public.session_notes;
create policy "session_notes_admin_all"
on public.session_notes for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "session_notes_client_read_visible" on public.session_notes;
create policy "session_notes_client_read_visible"
on public.session_notes for select
using (
  (client_visible_summary is not null or homework is not null)
  and exists (
    select 1
    from public.clients
    where clients.id = session_notes.client_id
      and clients.user_id = auth.uid()
  )
);

drop policy if exists "resource_categories_public_read_active" on public.resource_categories;
create policy "resource_categories_public_read_active"
on public.resource_categories for select
using (active = true or public.is_admin());

drop policy if exists "resource_categories_admin_all" on public.resource_categories;
create policy "resource_categories_admin_all"
on public.resource_categories for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "resources_client_read_visible" on public.resources;
create policy "resources_client_read_visible"
on public.resources for select
using (
  (auth.role() = 'authenticated' and visibility = 'all_clients')
  or public.is_admin()
  or (
    auth.role() = 'authenticated'
    and
    visibility = 'booked_clients'
    and public.is_booked_client(resources)
  )
);

drop policy if exists "resources_admin_all" on public.resources;
create policy "resources_admin_all"
on public.resources for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "calendar_connections_admin_all" on public.calendar_connections;
create policy "calendar_connections_admin_all"
on public.calendar_connections for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "booking_audit_logs_admin_read" on public.booking_audit_logs;
create policy "booking_audit_logs_admin_read"
on public.booking_audit_logs for select
using (public.is_admin());

drop policy if exists "booking_audit_logs_system_insert" on public.booking_audit_logs;
create policy "booking_audit_logs_system_insert"
on public.booking_audit_logs for insert
with check (public.is_admin());

insert into public.training_types (name, description, default_duration_minutes, hourly_rate)
values
  ('Batting', 'Swing mechanics, approach, tee work, front toss, and live reps.', 60, 30.00),
  ('Pitching', 'Command, mechanics, pitch design, and mound routines.', 60, 30.00),
  ('Defense/Infield', 'Footwork, glove work, transfers, angles, and game-speed reads.', 60, 30.00),
  ('Defense/Outfield', 'Routes, reads, first step, throwing, and communication.', 60, 30.00),
  ('Other', 'Custom private training session.', 60, 30.00)
on conflict (name) do nothing;

insert into public.resource_categories (name, slug, description, sort_order)
values
  ('Batting', 'batting', 'Swing mechanics, tee work, front toss, and hitting approach.', 10),
  ('Pitching', 'pitching', 'Pitching mechanics, command routines, and arm care.', 20),
  ('Defense', 'defense', 'Infield, outfield, glove work, throwing, and footwork.', 30),
  ('Game IQ', 'game-iq', 'Situational softball, mindset, and preparation.', 40)
on conflict (slug) do nothing;

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
