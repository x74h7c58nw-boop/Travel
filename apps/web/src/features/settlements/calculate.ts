import type { Expense, Member, Share } from '../../shared/types';

export function splitEqually(amount: number, participants: string[]) {
  const ids = [...new Set(participants)].sort();
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1_000_000_000 || !ids.length) {
    throw new Error('금액과 분담 대상을 확인하세요.');
  }
  return ids.map((user_id, index) => ({ user_id,
    amount: Math.floor(amount / ids.length) + (index < amount % ids.length ? 1 : 0) }));
}

export function calculateSettlement(members: Member[], expenses: Expense[], shares: Share[]) {
  const rows = members.map(m => ({ user_id: m.user_id, name: m.display_name, paid: 0, owed: 0, balance: 0 }));
  const byId = new Map(rows.map(r => [r.user_id, r]));
  const expenseMap = new Map(expenses.map(e => [e.id, e]));
  const allocated = new Map<string, number>();
  const seenShares = new Set<string>();
  for (const e of expenses) {
    const row = byId.get(e.paid_by);
    if (!row || !Number.isSafeInteger(e.amount) || e.amount <= 0) throw new Error('잘못된 결제 데이터입니다.');
    row.paid += e.amount;
    if (!Number.isSafeInteger(row.paid)) throw new Error('정산 가능 금액을 초과했습니다.');
  }
  for (const s of shares) {
    const row = byId.get(s.user_id);
    const key = `${s.expense_id}:${s.user_id}`;
    if (!row || !expenseMap.has(s.expense_id) || seenShares.has(key) || !Number.isSafeInteger(s.amount) || s.amount < 0) {
      throw new Error('잘못된 분담 데이터입니다.');
    }
    seenShares.add(key);
    row.owed += s.amount;
    if (!Number.isSafeInteger(row.owed)) throw new Error('정산 가능 금액을 초과했습니다.');
    allocated.set(s.expense_id, (allocated.get(s.expense_id) ?? 0) + s.amount);
  }
  for (const e of expenses) if (allocated.get(e.id) !== e.amount) throw new Error('결제액과 분담액이 일치하지 않습니다.');
  for (const r of rows) r.balance = r.paid - r.owed;
  const debtors = rows.filter(r => r.balance < 0).map(r => ({ id: r.user_id, remaining: -r.balance }));
  const creditors = rows.filter(r => r.balance > 0).map(r => ({ id: r.user_id, remaining: r.balance }));
  const transfers: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].remaining, creditors[j].remaining);
    transfers.push({ from: debtors[i].id, to: creditors[j].id, amount });
    debtors[i].remaining -= amount; creditors[j].remaining -= amount;
    if (!debtors[i].remaining) i++;
    if (!creditors[j].remaining) j++;
  }
  return { rows, transfers };
}
