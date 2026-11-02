import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const a='00000000-0000-0000-0000-000000000001';
const b='00000000-0000-0000-0000-000000000002';
const c='00000000-0000-0000-0000-000000000003';
test('실제 PostgreSQL 마이그레이션: RLS, RPC 권한, 원자성, 분담, 충돌', async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users(id) values ('${a}'),('${b}'),('${c}');
    `);
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261102000100_groups_settlement.sql', import.meta.url),'utf8'));
    async function query<T>(user: string|null, sql: string, args: unknown[] = []) {
      await db.exec(`set role ${user ? 'authenticated':'anon'}`);
      try {
        await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user ?? '']);
        return (await db.query<T>(sql,args)).rows;
      } finally { await db.exec('reset role'); }
    }
    const group=(await query<{id:string}>(a,"select public.create_travel_group('제주') as id"))[0].id;
    const code=(await query<{code:string}>(a,'select public.get_group_invite($1) as code',[group]))[0].code;
    await t.test('그룹 생성자 자동 가입, 비구성원·익명 접근 차단',async()=>{
      assert.equal((await query(a,'select * from public.group_members')).length,1);
      for(const table of ['groups','group_members','expenses','expense_shares']) assert.equal((await query(b,`select * from public.${table}`)).length,0);
      assert.equal((await query<{data:unknown}>(b,'select public.get_group_snapshot($1) as data',[group]))[0].data,null);
      await assert.rejects(query(null,"select public.create_travel_group('실패')"),/permission denied/);
      await assert.rejects(query(null,'select * from public.groups'),/permission denied/);
      await assert.rejects(query(b,'select public.get_group_invite($1)',[group]),/FORBIDDEN/);
      await assert.rejects(query(b,'select * from private.group_invites'),/permission denied/);
      await assert.rejects(query(b,"insert into public.group_members values ($1,$2,'침입')",[group,b]),/permission denied/);
    });
    await t.test('초대 코드 참여는 중복 없이 동작하고 구성원 목록 공유',async()=>{
      await assert.rejects(query(b,"select public.join_travel_group('invalid')"),/INVALID_INVITE/);
      await query(b,'select public.join_travel_group($1)',[code]);
      await query(b,'select public.join_travel_group($1)',[code]);
      assert.equal((await query(b,'select * from public.group_members')).length,2);
      await assert.rejects(query(b,'select public.get_group_invite($1)',[group]),/FORBIDDEN/);
    });
    async function save(user: string, title: string, amount: number, participants: string[], id: string|null=null, version: number|null=null, payer=a) {
      return query<{id:string}>(user,'select public.save_travel_expense($1,$2,$3,$4,$5,$6,$7,$8) as id',
        [group,title,amount,payer,'2026-11-02',participants,id,version]);
    }
    const expense=(await save(a,'저녁',10001,[b,a]))[0].id;
    await t.test('서버 분담은 1원 잔액을 보존하고 그룹 외 결제자·분담자를 거절',async()=>{
      const rows=await query<{user_id:string; amount:number}>(b,'select user_id, amount::int from public.expense_shares order by user_id');
      assert.deepEqual(rows,[{user_id:a,amount:5001},{user_id:b,amount:5000}]);
      await assert.rejects(save(a,'실패',10,[c]),/INVALID_PARTICIPANTS/);
      await assert.rejects(save(a,'실패',10,[a],null,null,c),/INVALID_PARTICIPANTS/);
      await assert.rejects(save(c,'침입',10,[a]),/FORBIDDEN/);
      assert.equal((await query(c,'select * from public.expenses')).length,0);
      assert.equal((await query(c,'select * from public.expense_shares')).length,0);
      await assert.rejects(query(b,'update public.expenses set amount=1 where id=$1',[expense]),/permission denied/);
      await assert.rejects(query(b,'delete from public.expense_shares where expense_id=$1',[expense]),/permission denied/);
    });
    await t.test('작성자 외 변경 차단, 오래된 버전 수정·삭제 차단',async()=>{
      await assert.rejects(save(b,'다른 작성자',50,[a,b],expense,1),/FORBIDDEN/);
      await assert.rejects(query(b,'select public.delete_travel_expense($1,1)',[expense]),/FORBIDDEN/);
      await save(a,'수정',3,[b,a],expense,1);
      await assert.rejects(save(a,'오래된 창',5,[a,b],expense,1),/CONFLICT/);
      await assert.rejects(query(a,'select public.delete_travel_expense($1,1)',[expense]),/CONFLICT/);
      await assert.rejects(save(a,'버전 누락',5,[a,b],expense,null),/CONFLICT/);
      const rows=await query<{title:string;version:number}>(b,'select title,version from public.expenses');
      assert.deepEqual(rows,[{title:'수정',version:2}]);
    });
    await t.test('오류 발생 시 결제와 분담 내역 및 버전이 함께 롤백',async()=>{
      await assert.rejects(save(a,'',20,[a,b],expense,2),/check constraint/);
      assert.deepEqual(await query(a,'select amount::int,version from public.expenses'),[{amount:3,version:2}]);
      assert.deepEqual(await query(a,'select sum(amount)::int as total from public.expense_shares'),[{total:3}]);
      await assert.rejects(save(a,'빈 분담',10,[]),/INVALID_PARTICIPANTS/);
      await assert.rejects(save(a,'음수',-10,[a]),/INVALID_AMOUNT/);
      assert.equal((await query(a,'select * from public.expenses')).length,1);
    });
    await t.test('다른 그룹 격리, 그룹 설정 생성자 검증과 버전 충돌',async()=>{
      await query(c,"select public.create_travel_group('다른 여행')");
      assert.equal((await query(a,'select * from public.groups')).length,1);
      const version=(await query<{version:number}>(a,'select version from public.groups'))[0].version;
      await assert.rejects(query(b,"select public.update_travel_group($1,$2,'부산',null,null)",[group,version]),/FORBIDDEN/);
      await query(a,"select public.update_travel_group($1,$2,'제주','2026-11-02','2026-11-04')",[group,version]);
      await assert.rejects(query(a,"select public.update_travel_group($1,$2,'부산',null,null)",[group,version]),/CONFLICT/);
      await assert.rejects(query(a,"select public.update_travel_group($1,$2,'제주','2026-11-04','2026-11-02')",[group,version+1]),/check constraint/);
    });
    await t.test('스냅샷 일관성 및 삭제 후 분담 연쇄 삭제',async()=>{
      const data=(await query<{data:{expenses:unknown[];shares:unknown[]}}>(b,'select public.get_group_snapshot($1) as data',[group]))[0].data;
      assert.equal(data.expenses.length,1); assert.equal(data.shares.length,2);
      const before=(await query<{version:number}>(a,'select version from public.groups'))[0].version;
      await query(a,'select public.delete_travel_expense($1,2)',[expense]);
      assert.equal((await query(b,'select * from public.expenses')).length,0);
      assert.equal((await query(b,'select * from public.expense_shares')).length,0);
      assert.equal((await query<{version:number}>(a,'select version from public.groups'))[0].version,before+1);
    });
  } finally { await db.close(); }
});
