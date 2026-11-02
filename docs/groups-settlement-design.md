# 그룹·정산 구현 초안 및 협업 계약

## 화면과 구현 순서

1. 설정·인증 상태 안내: Supabase 환경변수와 팀원의 실제 로그인 세션 확인
2. 내 여행: 그룹 생성, 초대 코드로 참여, 내 그룹 목록
3. 그룹 상세: 여행지·기간, 구성원, 생성자 전용 초대 코드·여행 설정
4. 결제: 목록, 신규 등록, 작성자만 수정·삭제, 분담 대상 선택
5. 정산: 개인별 결제액·부담액·잔액, 송금 안내

DB 및 권한 → 정산 순수 함수 → 인증 어댑터·데이터 계층 → 화면 → 자동 검증 순으로 구현합니다.

## 데이터와 권한

- `groups`: id, name, created_by, destination, start_date, end_date, version, updated_at. 그룹당 여행 하나.
- `group_members`: (group_id, user_id) 복합 PK, display_name. 가입 당시 사용자 메타데이터의 표시 이름 또는 식별자 일부를 표시하며 이메일은 공개하지 않습니다.
- `expenses`: id, group_id, created_by, paid_by, title, amount, spent_on, version.
- `expense_shares`: (expense_id, user_id) 복합 PK, amount.
- 초대 코드는 `private.group_invites`에 보관합니다. 공개 테이블 조회로 노출하지 않고 생성자만 RPC로 조회합니다. 코드는 UUID 기반 128비트 임의 값이며, 인증된 사용자만 참여 RPC를 호출합니다.
- 네 공개 테이블 모두 RLS를 활성화합니다. 그룹 구성원만 조회하고 직접 쓰기는 금지합니다. 쓰기는 인증·구성원·작성자 검증을 거치는 트랜잭션 RPC만 사용합니다.
- 그룹 생성과 생성자 가입, 결제와 분담 내역 저장은 각각 단일 트랜잭션입니다.
- 결제 등록·수정 시 결제자와 모든 분담자가 해당 그룹 구성원인지 DB에서 검사합니다.
- 여행 설정은 생성자만, 결제 변경은 작성자만 가능합니다.
- 탈퇴·구성원 삭제는 이번 범위에 없습니다. 기존 비용 관계를 보존합니다.

## 정산과 동시 수정

원화 정수만 지원합니다. 분담 대상 UUID를 오름차순으로 정렬한 뒤 몫을 배분하고 나머지 1원씩을 앞에서부터 배분합니다. 서버와 클라이언트에서 같은 규칙을 사용합니다. 허용 결제액은 1~1,000,000,000원입니다.

순잔액 = 총 결제액 − 총 부담액. 양수는 수신, 음수는 송금입니다. 금액을 보존하는 송금 목록을 계산하며 송금 횟수의 전역 최소화는 보장하지 않습니다. 정산 확정 테이블 없이 현재 DB 스냅샷으로 계산합니다.

결제 수정·삭제에는 조회한 version이 필요합니다. 그룹 행 잠금으로 해당 그룹의 쓰기를 직렬화하고 버전 불일치 시 CONFLICT를 반환합니다. 편집 중 실시간 갱신이 와도 편집 버전은 덮어쓰지 않습니다. 여행 설정도 그룹 version으로 충돌을 감지합니다.

모든 변경은 그룹 version을 증가시킵니다. `groups`의 UPDATE를 Realtime으로 구독해 삭제를 포함한 변경을 감지한 뒤 한 RPC에서 일관된 상세 스냅샷을 다시 조회합니다. 구독 완료·재연결·창 복귀 때도 다시 조회합니다. 실시간 연결이 실패해도 수동 새로고침과 재접속이 가능합니다.

## 팀원과 공유할 인터페이스

- 브라우저 Supabase 단일 인스턴스: `apps/web/src/shared/supabase.ts`의 `getSupabase()`.
- 인증 어댑터: `apps/web/src/shared/auth.ts`의 `useAuth()` → `{ user, loading, error }`. 실제 Supabase 세션 복구·변경 감지만 제공합니다. 로그인 폼과 로그인·로그아웃은 팀원이 구현합니다.
- 로그인 경로 계약: `/login`. 현재 로그인 링크는 팀원이 페이지를 추가한 후 연결됩니다.
- 환경변수: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. 서비스 역할 키는 사용하지 않습니다.
- 앨범은 `groups.id`를 FK로 사용하고 `(group_id, auth.uid())` 구성원 여부를 검증합니다. 기존 그룹 테이블·정책을 덮어쓰지 않습니다.
- 구성원 판별은 `private.is_group_member(uuid)`를 RLS에서 재사용할 수 있습니다. 인증 확인을 포함합니다.
- 그룹·정산 마이그레이션 파일 접미사는 `_groups_settlement`입니다. 팀원은 별도 타임스탬프/접미사를 사용하고 적용 순서를 확인합니다.
- 루트 npm workspace와 Next.js 설정은 공통 기반입니다. 팀원은 동일 lockfile을 사용하고 변경 시 먼저 공유합니다.
- `apps/api`는 예약 폴더이며 이번 구현에서 사용하지 않습니다.

## 공식 참고 문서

- [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
