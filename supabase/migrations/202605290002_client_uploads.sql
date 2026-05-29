begin;

-- Phase 4.5: client video review. Athletes upload swing/pitching videos
-- (client -> coach, the inverse of the Phase 4.4 resource library); the coach
-- watches them and leaves a client-visible summary.
--
-- Mirrors the established patterns:
--   * private Storage bucket + object policies like `training-resources`
--   * table RLS: owner (via clients.user_id) can insert/select; admin can do
--     everything; nothing public.
--   * touch_updated_at trigger like every other table.

do $$
begin
  create type public.client_upload_status as enum ('pending_review', 'reviewed', 'archived');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.client_uploads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- Optional link to the lesson the video came from. set null on booking delete
  -- so we keep the upload even if the booking row goes away.
  booking_id uuid references public.bookings(id) on delete set null,
  storage_path text not null,
  title text not null,
  description text,
  mime_type text not null,
  bytes bigint not null check (bytes >= 0),
  status public.client_upload_status not null default 'pending_review',
  coach_summary text,
  reviewed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_uploads_client_created_idx
  on public.client_uploads (client_id, created_at desc);

create index if not exists client_uploads_status_created_idx
  on public.client_uploads (status, created_at desc);

create index if not exists client_uploads_booking_id_idx
  on public.client_uploads (booking_id);

drop trigger if exists touch_client_uploads_updated_at on public.client_uploads;
create trigger touch_client_uploads_updated_at
before update on public.client_uploads
for each row execute function public.touch_updated_at();

alter table public.client_uploads enable row level security;

-- Admin (the coach) can do everything.
drop policy if exists "client_uploads_admin_all" on public.client_uploads;
create policy "client_uploads_admin_all"
on public.client_uploads for all
using (public.is_admin())
with check (public.is_admin());

-- A client can read their own uploads (rows whose client_id maps to their user).
drop policy if exists "client_uploads_owner_read" on public.client_uploads;
create policy "client_uploads_owner_read"
on public.client_uploads for select
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_uploads.client_id
      and c.user_id = auth.uid()
  )
);

-- A client can insert uploads only for their own client row.
drop policy if exists "client_uploads_owner_insert" on public.client_uploads;
create policy "client_uploads_owner_insert"
on public.client_uploads for insert
with check (
  exists (
    select 1
    from public.clients c
    where c.id = client_uploads.client_id
      and c.user_id = auth.uid()
  )
);

-- Private bucket with a 200 MB ceiling and a video-only MIME allowlist. The API
-- additionally validates these before minting the signed upload URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-uploads',
  'client-uploads',
  false,
  209715200,
  array['video/mp4', 'video/quicktime']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Admins can read anything in the bucket.
drop policy if exists "client_uploads_obj_admin_read" on storage.objects;
create policy "client_uploads_obj_admin_read"
on storage.objects for select
using (bucket_id = 'client-uploads' and public.is_admin());

-- Clients can read/write only under their own `{user_id}/...` prefix. The API
-- mints signed upload URLs (which bypass RLS), so this is defense-in-depth in
-- case a client ever hits Storage directly with their own JWT.
drop policy if exists "client_uploads_obj_owner_rw" on storage.objects;
create policy "client_uploads_obj_owner_rw"
on storage.objects for all
using (
  bucket_id = 'client-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'client-uploads'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
