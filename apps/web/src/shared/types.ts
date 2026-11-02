export type Group = {
  id: string; name: string; created_by: string; destination: string;
  start_date: string | null; end_date: string | null; version: number; updated_at: string;
};
export type Member = { group_id: string; user_id: string; display_name: string };
export type Expense = {
  id: string; group_id: string; created_by: string; paid_by: string;
  title: string; amount: number; spent_on: string; version: number;
};
export type Share = { expense_id: string; user_id: string; amount: number };
export type Snapshot = { group: Group; members: Member[]; expenses: Expense[]; shares: Share[] };
