import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSettlement, splitEqually } from '../src/features/settlements/calculate';
import type { Expense, Member } from '../src/shared/types';
const members: Member[] = ['a','b','c','d'].map(user_id => ({ user_id, group_id: 'g', display_name: user_id }));
function expense(id: string, paid_by: string, amount: number): Expense {
  return { id, group_id: 'g', created_by: paid_by, paid_by, amount, title: '식사', spent_on: '2026-11-02', version: 1 };
}
test('균등 분담: UUID 순서와 중복 입력에 독립적으로 1원 잔액 배분', () => {
  assert.deepEqual(splitEqually(10, ['c','a','b','a']), [
    { user_id:'a',amount:4 }, { user_id:'b',amount:3 }, { user_id:'c',amount:3 }
  ]);
  assert.deepEqual(splitEqually(1, ['b','a']), [{user_id:'a',amount:1},{user_id:'b',amount:0}]);
  for (const n of [0,-1,1.5,NaN,1_000_000_001]) assert.throws(() => splitEqually(n,['a']));
  assert.throws(() => splitEqually(100,[]));
});
test('분담 제외자, 결제자 미참여, 여러 결제를 반영한 송금 후 모든 잔액이 0', () => {
  const expenses = [expense('x','a',10001), expense('y','c',7000)];
  const shares = [
    ...splitEqually(10001,['b','c']).map(s => ({...s,expense_id:'x'})),
    ...splitEqually(7000,['a','b']).map(s => ({...s,expense_id:'y'}))
  ];
  const result = calculateSettlement(members,expenses,shares);
  assert.equal(result.rows.reduce((n,r) => n+r.paid,0),17001);
  assert.equal(result.rows.reduce((n,r) => n+r.owed,0),17001);
  assert.equal(result.rows.find(r => r.user_id === 'd')?.owed,0);
  const balance = new Map(result.rows.map(r => [r.user_id,r.balance]));
  for (const t of result.transfers) {
    assert.ok(t.amount > 0 && Number.isInteger(t.amount));
    balance.set(t.from,balance.get(t.from)!+t.amount);
    balance.set(t.to,balance.get(t.to)!-t.amount);
  }
  assert.ok([...balance.values()].every(n => n === 0));
});
test('빈 여행, 혼자 여행, 동일 금액 상쇄', () => {
  assert.deepEqual(calculateSettlement(members,[],[]).transfers,[]);
  assert.deepEqual(calculateSettlement(members,[expense('x','a',1)],[{expense_id:'x',user_id:'a',amount:1}]).transfers,[]);
  assert.deepEqual(calculateSettlement(members,[expense('x','a',2),expense('y','b',2)],[
    ...splitEqually(2,['a','b']).map(s=>({...s,expense_id:'x'})),
    ...splitEqually(2,['a','b']).map(s=>({...s,expense_id:'y'}))
  ]).transfers,[]);
});
test('손상된 분담 내역으로 정산하지 않음', () => {
  assert.throws(() => calculateSettlement(members,[expense('x','a',100)],[]));
  assert.throws(() => calculateSettlement(members,[expense('x','a',100)],[{expense_id:'x',user_id:'outsider',amount:100}]));
});
test('다양한 금액과 분담 조합에서 송금 후 잔액 보존', () => {
  for(let n=1;n<=200;n++) {
    const expenses = members.map((m,i) => expense(String(i),m.user_id,n*(i+1)));
    const shares = expenses.flatMap((e,i) => splitEqually(e.amount,members.slice(i%3).map(m=>m.user_id)).map(s=>({...s,expense_id:e.id})));
    const { rows,transfers } = calculateSettlement(members,expenses,shares);
    const balances = new Map(rows.map(r=>[r.user_id,r.balance]));
    for(const t of transfers){balances.set(t.from,balances.get(t.from)!+t.amount);balances.set(t.to,balances.get(t.to)!-t.amount);}
    assert.ok([...balances.values()].every(v=>v===0));
  }
});
