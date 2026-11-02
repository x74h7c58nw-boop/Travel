-- Prerequisites owned by the groups feature:
-- public.groups(id uuid primary key)
-- public.group_members(group_id uuid, user_id uuid)

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  created_at timestamptz not null default now(),
  check (
    storage_path ~ (
      '^' || group_id::text || '/' || uploaded_by::text ||
      '/[0-9a-f-]{36}\.(jpg|png|webp)$'
    )
  ),
  check (
    (content_type = 'image/jpeg' and storage_path ~ '\.jpg$')
    or (content_type = 'image/png' and storage_path ~ '\.png$')
    or (content_type = 'image/webp' and storage_path ~ '\.webp$')
  ),
  unique (id, group_id)
);

create index photos_group_created_idx on public.photos (group_id, created_at desc);
create index photos_uploader_idx on public.photos (uploaded_by);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id)
);

create index albums_group_updated_idx on public.albums (group_id, updated_at desc);
create index albums_creator_idx on public.albums (created_by);

create table public.album_photos (
  album_id uuid not null references public.albums(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (album_id, photo_id),
  unique (album_id, position)
);

create index album_photos_photo_idx on public.album_photos (photo_id);

grant select, insert, delete on public.photos to authenticated;
grant select, delete on public.albums to authenticated;
grant select on public.album_photos to authenticated;
revoke insert, update on public.albums from authenticated;
revoke insert, update, delete on public.album_photos from authenticated;
revoke all on public.photos, public.albums, public.album_photos from anon;

create or replace function public.auth_album_is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = (select auth.uid())
  );
$$;

revoke all on function public.auth_album_is_group_member(uuid) from public, anon;
grant execute on function public.auth_album_is_group_member(uuid) to authenticated;

create or replace function public.set_auth_album_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger albums_set_auth_album_updated_at
before update on public.albums
for each row execute function public.set_auth_album_updated_at();

create or replace function public.prevent_auth_album_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id <> old.group_id or new.created_by <> old.created_by then
    raise exception 'album_identity_is_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger albums_auth_identity_immutable
before update on public.albums
for each row execute function public.prevent_auth_album_identity_change();

create or replace function public.touch_auth_album_after_photo_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_album_id uuid;
begin
  if tg_op = 'DELETE' then
    affected_album_id = old.album_id;
  else
    affected_album_id = new.album_id;
  end if;
  update public.albums
  set updated_at = now()
  where id = affected_album_id;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger album_photos_touch_auth_album
after insert or update or delete on public.album_photos
for each row execute function public.touch_auth_album_after_photo_change();

create or replace function public.create_album(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_photo_ids uuid[]
)
returns public.albums
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_album public.albums;
  valid_photo_count integer;
begin
  if auth.uid() is null or not public.auth_album_is_group_member(p_group_id) then
    raise exception 'group_membership_required' using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'invalid_album_title' using errcode = '22023';
  end if;

  if p_description is null or char_length(p_description) > 2000 then
    raise exception 'invalid_album_description' using errcode = '22023';
  end if;

  if p_photo_ids is null or cardinality(p_photo_ids) = 0 then
    raise exception 'album_requires_photos' using errcode = '22023';
  end if;

  select count(*)
  into valid_photo_count
  from (
    select distinct unnest(p_photo_ids) as photo_id
  ) selected
  join public.photos photo
    on photo.id = selected.photo_id
   and photo.group_id = p_group_id;

  if valid_photo_count <> cardinality(p_photo_ids) then
    raise exception 'album_photos_must_belong_to_group' using errcode = '22023';
  end if;

  insert into public.albums (group_id, created_by, title, description)
  values (p_group_id, auth.uid(), btrim(p_title), p_description)
  returning * into new_album;

  insert into public.album_photos (album_id, photo_id, position)
  select new_album.id, selected.photo_id, selected.ordinality::integer - 1
  from unnest(p_photo_ids) with ordinality as selected(photo_id, ordinality);

  select * into new_album from public.albums where id = new_album.id;
  return new_album;
end;
$$;

create or replace function public.update_album(
  p_album_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_description text,
  p_photo_ids uuid[]
)
returns public.albums
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_album public.albums;
  valid_photo_count integer;
begin
  select *
  into target_album
  from public.albums
  where id = p_album_id
    and created_by = auth.uid()
    and public.auth_album_is_group_member(group_id)
    and updated_at = p_expected_updated_at
  for update;

  if not found then
    raise exception 'album_conflict_or_access_denied' using errcode = '40001';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'invalid_album_title' using errcode = '22023';
  end if;

  if p_description is null or char_length(p_description) > 2000 then
    raise exception 'invalid_album_description' using errcode = '22023';
  end if;

  if p_photo_ids is null or cardinality(p_photo_ids) = 0 then
    raise exception 'album_requires_photos' using errcode = '22023';
  end if;

  select count(*)
  into valid_photo_count
  from (
    select distinct unnest(p_photo_ids) as photo_id
  ) selected
  join public.photos photo
    on photo.id = selected.photo_id
   and photo.group_id = target_album.group_id;

  if valid_photo_count <> cardinality(p_photo_ids) then
    raise exception 'album_photos_must_belong_to_group' using errcode = '22023';
  end if;

  update public.albums
  set title = btrim(p_title),
      description = p_description
  where id = p_album_id;

  delete from public.album_photos where album_id = p_album_id;

  insert into public.album_photos (album_id, photo_id, position)
  select p_album_id, selected.photo_id, selected.ordinality::integer - 1
  from unnest(p_photo_ids) with ordinality as selected(photo_id, ordinality);

  select * into target_album from public.albums where id = p_album_id;
  return target_album;
end;
$$;

revoke all on function public.create_album(uuid, text, text, uuid[]) from public, anon;
revoke all on function public.update_album(uuid, timestamptz, text, text, uuid[]) from public, anon;
grant execute on function public.create_album(uuid, text, text, uuid[]) to authenticated;
grant execute on function public.update_album(uuid, timestamptz, text, text, uuid[]) to authenticated;

alter table public.photos enable row level security;
alter table public.albums enable row level security;
alter table public.album_photos enable row level security;
alter table public.photos replica identity full;
alter table public.albums replica identity full;

create policy "Group members can read photos"
on public.photos for select to authenticated
using (public.auth_album_is_group_member(group_id));

create policy "Group members can add their own photos"
on public.photos for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.auth_album_is_group_member(group_id)
);

create policy "Uploaders can delete their own photos"
on public.photos for delete to authenticated
using (
  uploaded_by = (select auth.uid())
  and public.auth_album_is_group_member(group_id)
  and storage_path like group_id::text || '/' || (select auth.uid())::text || '/%'
  and not exists (
    select 1
    from public.album_photos album_photo
    where album_photo.photo_id = photos.id
  )
);

create policy "Group members can read albums"
on public.albums for select to authenticated
using (public.auth_album_is_group_member(group_id));

create policy "Group members can create their own albums"
on public.albums for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.auth_album_is_group_member(group_id)
);

create policy "Creators can update their own albums"
on public.albums for update to authenticated
using (
  created_by = (select auth.uid())
  and public.auth_album_is_group_member(group_id)
)
with check (
  created_by = (select auth.uid())
  and public.auth_album_is_group_member(group_id)
);

create policy "Creators can delete their own albums"
on public.albums for delete to authenticated
using (
  created_by = (select auth.uid())
  and public.auth_album_is_group_member(group_id)
);

create policy "Group members can read album photos"
on public.album_photos for select to authenticated
using (
  exists (
    select 1
    from public.albums album
    join public.photos photo on photo.id = album_photos.photo_id
    where album.id = album_photos.album_id
      and album.group_id = photo.group_id
      and public.auth_album_is_group_member(album.group_id)
  )
);

create policy "Album creators can manage album photos"
on public.album_photos for all to authenticated
using (
  exists (
    select 1
    from public.albums album
    where album.id = album_photos.album_id
      and album.created_by = (select auth.uid())
      and public.auth_album_is_group_member(album.group_id)
  )
)
with check (
  exists (
    select 1
    from public.albums album
    join public.photos photo on photo.id = album_photos.photo_id
    where album.id = album_photos.album_id
      and album.created_by = (select auth.uid())
      and public.auth_album_is_group_member(album.group_id)
      and album.group_id = photo.group_id
  )
);

create or replace function public.enforce_auth_album_photo_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.albums album
    join public.photos photo on photo.id = new.photo_id
    where album.id = new.album_id
      and album.group_id = photo.group_id
  ) then
    raise exception 'album_photos_must_belong_to_same_group' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger album_photos_auth_same_group
before insert or update on public.album_photos
for each row execute function public.enforce_auth_album_photo_group();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'travel-photos',
  'travel-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Group members can view group photo objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'travel-photos'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and public.auth_album_is_group_member((storage.foldername(name))[1]::uuid)
);

create policy "Members can upload objects into their own group folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'travel-photos'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and public.auth_album_is_group_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy "Uploaders can delete their group photo objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'travel-photos'
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and public.auth_album_is_group_member((storage.foldername(name))[1]::uuid)
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'albums'
  ) then
    alter publication supabase_realtime add table public.albums;
  end if;
end;
$$;
