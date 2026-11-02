# 웹 애플리케이션

Next.js App Router + TypeScript 앱입니다. 초기 버전은 별도 API 서버 없이 Supabase에 연결합니다.

## 로컬 실행

1. Supabase 프로젝트를 준비하고 Authentication의 이메일 제공자를 활성화합니다.
2. 이 디렉터리에서 `.env.example`을 `.env.local`로 복사한 뒤 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 설정합니다. 비밀 서비스 키는 브라우저 앱에 절대 넣지 않습니다.
3. 저장소 루트에서 `npm ci`, `npm run dev`를 실행합니다.
4. 가입 이메일의 확인 링크가 `/login`으로 돌아오도록 Supabase의 Site URL 및 Redirect URLs에 로컬/배포 URL을 등록합니다.
5. 먼저 `supabase/migrations/20261102000100_groups_settlement.sql`, 다음으로 `infra/supabase/migrations/20261102190000_auth_albums.sql`을 적용합니다. Supabase CLI 설정은 아직 없으므로 현재는 SQL Editor에서 순서대로 적용합니다.

## 공통 인증 모듈 계약

`src/shared/auth/AuthProvider.tsx`의 `AuthProvider`를 루트에 한 번 두고 `useAuth()`로 현재 `user`, `loading`, `configured`, `error`/`sessionError`, `signIn`, `signUp`, `signOut`을 사용합니다. 그룹 기능은 호환 어댑터 `src/shared/auth.ts`를 통해 같은 세션을 사용합니다. `user.id`가 데이터의 사용자 식별자입니다.

```tsx
const { user, loading, signIn, signOut } = useAuth();
```

`ProtectedLayout`은 세션 복구가 끝나기 전 내부 화면을 보여주지 않고, 로그인되지 않은 사용자를 `/login`으로 보냅니다. 기능 코드는 `getSupabaseBrowserClient()`로 DB/Storage/Realtime을 사용합니다. 화면 보호는 접근제어의 대체물이 아니며 모든 테이블과 파일 접근은 RLS/Storage 정책이 검사해야 합니다. 비밀번호를 앱 테이블이나 브라우저 저장소에 복사하지 않습니다.

## 기능 라우트 및 권한

- `/`: 그룹 생성·초대·여행 설정·결제·정산 (그룹 생성자와 작성자 권한은 DB RPC에서 검사)
- `/groups`: 참여 그룹의 앨범으로 이동
- `/groups/[groupId]/albums`: 구성원 사진, 사진 업로드/삭제, 앨범 생성·수정·삭제

- `/signup`, `/login`: 이메일/비밀번호 인증과 세션 관리
- 비공개 `travel-photos` 버킷 경로는 `{group_id}/{user_id}/{uuid}.{jpg|png|webp}`이며 10MB 제한입니다.
- 업로드는 MIME 유형과 이미지 시그니처를 확인합니다. 이미 앨범에 포함된 사진은 작성자가 앨범에서 먼저 제외해야 업로더가 사진을 삭제할 수 있습니다.
- 앨범 RPC는 생성·구성 변경을 트랜잭션으로 처리하고 `updated_at` 비교로 동시 편집을 감지합니다. 순서 0이 표지입니다.
- AI 자동 편집, 인쇄용 파일, 공개 SNS 피드는 후속 범위입니다.

공유 테이블, RLS 정책, 그룹 연동 제약은 [인증·앨범 구현 및 연동 계약](../../docs/auth-albums-implementation.md), 그룹과 정산 기능은 [그룹·정산 실행 안내](../../docs/groups-settlement-setup.md)를 확인하세요.
