import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const owner = '00000000-0000-0000-0000-000000000001';
const member = '00000000-0000-0000-0000-000000000002';
const outsider = '00000000-0000-0000-0000-000000000003';
const photoId = '00000000-0000-4000-8000-000000000004';
const objectId = '00000000-0000-4000-8000-000000000005';

test('앨범 마이그레이션: 그룹 격리, 파일 권한, 작성자와 교차 그룹 검증', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(
        id uuid primary key,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      insert into auth.users(id) values ('${owner}'), ('${member}'), ('${outsider}');

      create schema storage;
      create table storage.buckets(
        id text primary key,
        name text not null,
        public boolean not null,
        file_size_limit bigint,
        allowed_mime_types text[]
      );
      create table storage.objects(
        id uuid primary key default gen_random_uuid(),
        bucket_id text not null,
        name text not null,
        unique(bucket_id, name)
      );
      create function storage.foldername(name text) returns text[]
        language sql immutable as $$ select string_to_array(name, '/') $$;
      grant usage on schema storage to authenticated;
      grant execute on function storage.foldername(text) to authenticated;
      grant select, insert, delete on storage.objects to authenticated;
    `);

    await db.exec(
      await readFile(
        new URL('../../../supabase/migrations/20261102000100_groups_settlement.sql', import.meta.url),
        'utf8',
      ),
    );

    const albumMigration = await readFile(
      new URL('../../../infra/supabase/migrations/20261102190000_auth_albums.sql', import.meta.url),
      'utf8',
    );
    const realtimeBlockStart = albumMigration.indexOf(
      '\ndo $$\nbegin\n  if not exists (\n    select 1\n    from pg_publication_tables',
    );
    assert.notEqual(realtimeBlockStart, -1, 'Realtime publication block should exist');
    await db.exec(albumMigration.slice(0, realtimeBlockStart));
    await db.exec('alter table storage.objects enable row level security');

    async function query<T>(
      userId: string | null,
      sql: string,
      args: unknown[] = [],
    ) {
      await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`);
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
          userId ?? '',
        ]);
        return (await db.query<T>(sql, args)).rows;
      } finally {
        await db.exec('reset role');
      }
    }

    const groupId = (
      await query<{ id: string }>(owner, "select public.create_travel_group('앨범 그룹') as id")
    )[0].id;
    const otherGroupId = (
      await query<{ id: string }>(owner, "select public.create_travel_group('다른 그룹') as id")
    )[0].id;
    const inviteCode = (
      await query<{ code: string }>(owner, 'select public.get_group_invite($1) as code', [
        groupId,
      ])
    )[0].code;
    await query(member, 'select public.join_travel_group($1)', [inviteCode]);

    const objectPath = `${groupId}/${owner}/${photoId}.jpg`;
    await query(owner, 'insert into storage.objects(id,bucket_id,name) values ($1,$2,$3)', [
      objectId,
      'travel-photos',
      objectPath,
    ]);
    await query(owner, `
      insert into public.photos(
        id,group_id,uploaded_by,storage_path,original_name,content_type,byte_size
      ) values ($1,$2,$3,$4,$5,$6,$7)
    `, [photoId, groupId, owner, objectPath, 'trip.jpg', 'image/jpeg', 1024]);

    const albumId = (
      await query<{ id: string }>(
        owner,
        'select id from public.create_album($1,$2,$3,$4)',
        [groupId, '함께한 여행', '공유 앨범', [photoId]],
      )
    )[0].id;

    assert.equal((await query(member, 'select id from public.photos where group_id=$1', [groupId])).length, 1);
    assert.equal((await query(member, 'select id from public.albums where group_id=$1', [groupId])).length, 1);
    assert.equal((await query(outsider, 'select id from public.photos')).length, 0);
    assert.equal((await query(outsider, 'select id from public.albums')).length, 0);

    assert.equal(
      (await query(member, 'select name from storage.objects where bucket_id=$1', ['travel-photos'])).length,
      1,
    );
    assert.equal(
      (await query(outsider, 'select name from storage.objects where bucket_id=$1', ['travel-photos'])).length,
      0,
    );
    await assert.rejects(
      query(outsider, 'insert into storage.objects(bucket_id,name) values ($1,$2)', [
        'travel-photos',
        `${groupId}/${outsider}/${photoId}.jpg`,
      ]),
      /row-level security/,
    );

    await assert.rejects(
      query(member, 'select * from public.update_album($1,$2,$3,$4,$5)', [
        albumId,
        (
          await query<{ updated_at: string }>(
            owner,
            'select updated_at from public.albums where id=$1',
            [albumId],
          )
        )[0].updated_at,
        '수정 시도',
        '',
        [photoId],
      ]),
      /album_conflict_or_access_denied/,
    );
    await assert.rejects(
      query(owner, 'select * from public.create_album($1,$2,$3,$4)', [
        otherGroupId,
        '교차 그룹',
        '',
        [photoId],
      ]),
      /album_photos_must_belong_to_group/,
    );
  } finally {
    await db.close();
  }
});
