-- Group/settlement ownership only. Auth and album tables belong to the teammate.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id),
  destination text not null default '' check (char_length(destination) <= 120),
  start_date date,
  end_date date,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check ((start_date is null and end_date is null) or
    (start_date is not null and end_date is not null and end_date >= start_date))
);
create table public.group_members (
  group_id uuid not null references public.groups(id),
  user_id uuid not null references auth.users(id),
  display_name text not null,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members(user_id);
create table private.group_invites (
  group_id uuid primary key references public.groups(id),
  code text not null unique default replace(gen_random_uuid()::text, '-', '')
);
revoke all on private.group_invites from public, anon, authenticated;
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  created_by uuid not null references auth.users(id),
  paid_by uuid not null references auth.users(id),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  amount bigint not null check (amount between 1 and 1000000000),
  spent_on date not null,
  version integer not null default 1,
  foreign key (group_id, paid_by) references public.group_members(group_id, user_id),
  foreign key (group_id, created_by) references public.group_members(group_id, user_id)
);
create index expenses_group_idx on public.expenses(group_id);
create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  amount bigint not null check (amount >= 0),
  primary key (expense_id, user_id)
);

create function private.is_group_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()
  );
$$;
revoke all on function private.is_group_member(uuid) from public, anon, authenticated;
grant execute on function private.is_group_member(uuid) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
revoke all on public.groups, public.group_members, public.expenses, public.expense_shares from anon, authenticated;
grant select on public.groups, public.group_members, public.expenses, public.expense_shares to authenticated;
create policy groups_read on public.groups for select to authenticated using (private.is_group_member(id));
create policy members_read on public.group_members for select to authenticated using (private.is_group_member(group_id));
create policy expenses_read on public.expenses for select to authenticated using (private.is_group_member(group_id));
create policy shares_read on public.expense_shares for select to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and private.is_group_member(e.group_id))
);

create function private.member_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'), 40), ''), '여행원 ' || left(id::text, 8))
  from auth.users where id = auth.uid();
$$;
revoke all on function private.member_name() from public, anon, authenticated;

create function public.create_travel_group(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.groups(name, created_by) values (btrim(p_name), auth.uid()) returning id into v_id;
  insert into public.group_members values (v_id, auth.uid(), private.member_name());
  insert into private.group_invites(group_id) values (v_id);
  return v_id;
end;
$$;
create function public.get_group_invite(p_group_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.groups where id = p_group_id and created_by = auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;
  return (select code from private.group_invites where group_id = p_group_id);
end;
$$;
create function public.join_travel_group(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select group_id into v_id from private.group_invites where code = lower(btrim(p_code));
  if v_id is null then raise exception 'INVALID_INVITE'; end if;
  perform 1 from public.groups where id = v_id for update;
  insert into public.group_members values (v_id, auth.uid(), private.member_name()) on conflict do nothing;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    update public.groups set version = version + 1, updated_at = clock_timestamp() where id = v_id;
  end if;
  return v_id;
end;
$$;
create function public.update_travel_group(p_group_id uuid, p_version integer, p_destination text, p_start date, p_end date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_group public.groups;
begin
  select * into v_group from public.groups where id = p_group_id for update;
  if auth.uid() is null or v_group.created_by is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
  if p_version is distinct from v_group.version then raise exception 'CONFLICT'; end if;
  update public.groups set destination = btrim(p_destination), start_date = p_start, end_date = p_end,
    version = version + 1, updated_at = clock_timestamp() where id = p_group_id;
end;
$$;

create function public.save_travel_expense(
  p_group_id uuid, p_title text, p_amount bigint, p_paid_by uuid, p_spent_on date,
  p_participants uuid[], p_expense_id uuid default null, p_version integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_old public.expenses; v_users uuid[]; v_count integer;
begin
  perform 1 from public.groups where id = p_group_id for update;
  if not private.is_group_member(p_group_id) then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000 then raise exception 'INVALID_AMOUNT'; end if;
  select array_agg(u order by u) into v_users from (select distinct unnest(p_participants) as u) s;
  v_count := coalesce(cardinality(v_users), 0);
  if v_count = 0 or exists (select 1 from unnest(v_users) u where u is null) then raise exception 'INVALID_PARTICIPANTS'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_paid_by)
    or exists (select 1 from unnest(v_users) u where not exists (
      select 1 from public.group_members where group_id = p_group_id and user_id = u
    )) then raise exception 'INVALID_PARTICIPANTS'; end if;
  if p_expense_id is null then
    insert into public.expenses(group_id, created_by, paid_by, title, amount, spent_on)
      values (p_group_id, auth.uid(), p_paid_by, btrim(p_title), p_amount, p_spent_on) returning id into v_id;
  else
    select * into v_old from public.expenses where id = p_expense_id and group_id = p_group_id for update;
    if v_old.created_by is distinct from auth.uid() then raise exception 'FORBIDDEN'; end if;
    if p_version is distinct from v_old.version then raise exception 'CONFLICT'; end if;
    v_id := p_expense_id;
    update public.expenses set paid_by = p_paid_by, title = btrim(p_title), amount = p_amount,
      spent_on = p_spent_on, version = version + 1 where id = v_id;
    delete from public.expense_shares where expense_id = v_id;
  end if;
  insert into public.expense_shares(expense_id, user_id, amount)
    select v_id, u, p_amount / v_count + case when ordinal <= p_amount % v_count then 1 else 0 end
    from unnest(v_users) with ordinality as s(u, ordinal);
  update public.groups set version = version + 1, updated_at = clock_timestamp() where id = p_group_id;
  return v_id;
end;
$$;
create function public.delete_travel_expense(p_expense_id uuid, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.expenses; v_group uuid;
begin
  select group_id into v_group from public.expenses where id = p_expense_id;
  perform 1 from public.groups where id = v_group for update;
  select * into v_old from public.expenses where id = p_expense_id for update;
  if auth.uid() is null or v_old.created_by is distinct from auth.uid() or not private.is_group_member(v_group) then raise exception 'FORBIDDEN'; end if;
  if p_version is distinct from v_old.version then raise exception 'CONFLICT'; end if;
  delete from public.expenses where id = p_expense_id;
  update public.groups set version = version + 1, updated_at = clock_timestamp() where id = v_group;
end;
$$;
-- One statement snapshot prevents mixing expenses and shares from different commits.
create function public.get_group_snapshot(p_group_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'group', to_jsonb(g),
    'members', coalesce((select jsonb_agg(m order by m.user_id) from public.group_members m where m.group_id = g.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(e order by e.spent_on desc, e.id) from public.expenses e where e.group_id = g.id), '[]'::jsonb),
    'shares', coalesce((select jsonb_agg(s) from public.expense_shares s join public.expenses e on e.id = s.expense_id where e.group_id = g.id), '[]'::jsonb)
  ) from public.groups g where g.id = p_group_id;
$$;

revoke all on function public.create_travel_group(text), public.get_group_invite(uuid), public.join_travel_group(text),
  public.update_travel_group(uuid, integer, text, date, date),
  public.save_travel_expense(uuid, text, bigint, uuid, date, uuid[], uuid, integer),
  public.delete_travel_expense(uuid, integer), public.get_group_snapshot(uuid) from public, anon;
grant execute on function public.create_travel_group(text), public.get_group_invite(uuid), public.join_travel_group(text),
  public.update_travel_group(uuid, integer, text, date, date),
  public.save_travel_expense(uuid, text, bigint, uuid, date, uuid[], uuid, integer),
  public.delete_travel_expense(uuid, integer), public.get_group_snapshot(uuid) to authenticated;

-- Only the group invalidation row is replicated. Expenses and shares are fetched under RLS.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups') then
      alter publication supabase_realtime add table public.groups;
    end if;
  end if;
end $$;
