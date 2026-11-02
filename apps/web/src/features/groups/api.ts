import { getSupabase } from '../../shared/supabase';
import type { Database } from '../../shared/auth/database.types';
import type { Group, Snapshot } from '../../shared/types';

type Functions = Database['public']['Functions'];
type FunctionName = keyof Functions;

export function db() {
  const client = getSupabase();
  if (!client) throw new Error('Supabase 환경변수를 설정하세요.');
  return client;
}

export async function rpc<Name extends FunctionName>(
  name: Name,
  args: Functions[Name]['Args'],
): Promise<Functions[Name]['Returns']> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw error;
  return data;
}
export async function listGroups(): Promise<Group[]> {
  const { data, error } = await db().from('groups').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function readGroup(id: string) {
  const data = await rpc('get_group_snapshot', { p_group_id: id });
  if (!data) throw new Error('그룹을 조회할 수 없습니다. 참여 권한을 확인하세요.');
  return data as Snapshot;
}
export function describeError(error: unknown) {
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : String(error);
  if (message.includes('CONFLICT')) return '다른 창에서 내용이 변경되었습니다. 최신 내용을 확인하고 편집을 다시 시작하세요. 입력한 내용은 유지됩니다.';
  if (message.includes('FORBIDDEN')) return '이 작업을 수행할 권한이 없습니다.';
  if (message.includes('INVALID_INVITE')) return '초대 코드가 올바르지 않습니다.';
  if (message.includes('INVALID_PARTICIPANTS')) return '결제자와 분담 대상을 확인하세요.';
  if (message.includes('AUTH_REQUIRED')) return '먼저 로그인해 주세요.';
  if (message.includes('INVALID_AMOUNT')) return '결제 금액은 1원부터 10억원까지 정수로 입력하세요.';
  if (message.includes('check constraint') || message.includes('not-null constraint')) return '입력값을 확인하세요. 이름·항목은 공백일 수 없으며, 날짜는 시작일과 종료일을 함께 올바른 순서로 입력해야 합니다.';
  return `요청을 처리하지 못했습니다: ${message}`;
}
