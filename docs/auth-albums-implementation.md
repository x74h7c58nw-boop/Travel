# Authentication and albums implementation draft

## Scope and screens

- `/signup`: email/password registration, email-confirmation guidance, and validation errors.
- `/login`: email/password login, session-restoration loading state, and authentication errors.
- `/groups/[groupId]/albums`: member-only group photo library, multi-photo upload, album creation, album viewing/editing, and deletion.
- A protected route layout redirects unauthenticated users to `/login`; database and Storage RLS remain the actual access-control boundary.

AI editing, print-ready exports, and public social feeds are explicitly deferred.

## Data model

Supabase Auth owns user identity; `auth.users.id` is used as `uploaded_by` and `created_by`.

| Table | Owned fields and purpose |
| --- | --- |
| `photos` | `id`, `group_id`, `uploaded_by`, `storage_path`, original file name, MIME type, size, and timestamps |
| `albums` | `id`, `group_id`, `created_by`, title, description, and timestamps |
| `album_photos` | `album_id`, `photo_id`, `position`; position zero is the cover photo |

`photos.group_id` and `albums.group_id` reference `groups.id`. A database trigger rejects album/photo links across groups. Membership and group tables are owned by the teammate and are prerequisites: `groups(id)` and `group_members(group_id, user_id)`.

## Authorization and synchronization

- RLS grants photo/album reads only to authenticated group members.
- A member may add their own photo metadata; only its uploader may delete it, and only after album creators have removed it from every album that references it.
- Only an album's creator may change or delete it; membership is still required.
- `album_photos` reads require group membership; writes require ownership of the album and same-group photos.
- The private `travel-photos` bucket accepts paths shaped as `{group_id}/{user_id}/{uuid}.{ext}`. Storage policies check the path's group membership; object deletion is limited to its owner.
- The browser uses short-lived signed URLs after RLS-filtered reads. Realtime subscriptions are scoped by `group_id`; album-link changes update the parent album timestamp so clients receive them too.
- Album writes compare the previously read `updated_at`; a missing conditional-update result is shown as a concurrent-edit conflict, not a successful save.
- Upload stores the object first, then metadata. If metadata registration fails, the client checks for an already-committed row before removing the object; an ambiguous database response keeps the file and exposes a metadata-registration retry. Cleanup failures are reported with the affected path. Album creation similarly uses one database function/transaction so it cannot leave a partial album.

## Team integration contract

- The auth provider exposes `user`, `loading`, `signIn`, `signUp`, and `signOut` from `apps/web/src/shared/auth`.
- Feature code uses `user.id` as the only user identifier and must not store passwords in application tables or browser storage.
- Group pages pass a `groupId` obtained from the teammate-owned groups feature. This implementation reads `group_members` for membership but does not create, invite, edit, or delete groups or members.
- The teammate must provide `groups(id)` and `group_members(group_id, user_id)` before end-to-end shared access can be verified. Apply this feature's migration only after those tables exist.
- The groups feature must let an authenticated user read their own `group_members` rows so the group picker can resolve their group IDs. Group resource access still relies on the group's RLS policies and the album/photo policies in this migration.
- Supabase environment variables are `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; values belong in an ignored `.env.local`, never in Git. `.env.example` contains names only.
- Migration filename prefix `20261102190000` is reserved for this auth/photo/album change. The teammate should choose a distinct timestamp/prefix for group work.

## Implementation order

1. Establish the Next.js/TypeScript app and Supabase client/auth provider.
2. Add registration, login, session restoration, logout, and protected routes.
3. Add the uniquely named SQL migration for tables, indexes, triggers, RLS, Storage policies, and Realtime publication.
4. Implement member-scoped photo uploads, signed image URLs, and upload cleanup.
5. Implement album creation, ordering/cover selection, creator-only edits/deletion, and optimistic concurrency checks.
6. Document setup and the team interfaces; validate build/type/lint and database policies where Supabase credentials/schema are available.

## Verification limits before group integration

The current repository has no Supabase project configuration and no `groups` or `group_members` schema. Local checks can validate TypeScript/build and migration structure, but two-account sharing, persisted database reads, Realtime delivery, and cross-group denial require a Supabase project, the teammate's group schema, and two test accounts. Those integration checks remain pending until those prerequisites are supplied.
