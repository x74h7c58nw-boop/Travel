# 공유 여행 계획 서비스

여행 그룹을 만들고 여행원을 초대해 여행지와 일정을 정하며, 공동 경비 정산과 사진 앨범 제작·공유를 제공하는 서비스입니다.

## 기술 구성

- 웹 앱: `apps/web`의 Next.js + TypeScript. 초기 버전은 별도 API 서버 없이 Supabase에 연결합니다.
- 인증 및 사용자 ID: Supabase Auth의 `auth.users.id`
- 영구 저장과 권한 검사: Supabase PostgreSQL 및 RLS
- 사진: 비공개 Supabase Storage 버킷
- 같은 그룹의 변경 알림: Supabase Realtime
- `apps/api`는 예약 폴더이며 현재 별도 API 서버는 없습니다.

## 로컬 실행

Node.js 22 이상에서 저장소 루트 기준으로 실행합니다.

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local
# .env.local에 Supabase URL과 publishable key 입력
npm run dev
```

http://localhost:3000 에서 확인합니다. 환경 변수는 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`이며 비밀 서비스 역할 키는 사용하지 않습니다. DB 적용과 그룹/정산 검증은 [그룹·정산 실행 안내](docs/groups-settlement-setup.md), 로그인·사진·앨범 설정은 [웹 앱 안내](apps/web/README.md)를 참고하세요.

```sh
npm test
npm run typecheck
npm run build
npm run lint
```

## 폴더 구조

```text
Travel/
├── apps/
│   ├── web/                 # Next.js 웹 앱
│   └── api/                 # 예약 폴더 (현재 별도 서버 없음)
├── packages/
│   └── contracts/           # 클라이언트·서버 간 데이터 및 API 규칙
├── docs/                    # 요구사항, 데이터 모델, 실행 및 연동 문서
├── infra/supabase/          # 사진·앨범 마이그레이션
├── supabase/migrations/     # 그룹·정산 마이그레이션
└── scripts/                 # 개발·운영 자동화
```

## 기능 구분

- `groups`: 여행 그룹 생성, 여행원 초대와 참여
- `trips`: 여행지와 여행 날짜 설정
- `expenses`: 결제 내역 등록 및 비용 분담
- `settlements`: 최종 정산 및 송금 안내
- `albums`: 사진 업로드, 여행 앨범 제작·공유
- `posts`: 앨범 게시와 공개 범위 관리 (후속 범위)

그룹 생성·초대·멤버십·결제와 정산은 [그룹·정산 설계](docs/groups-settlement-design.md)가, 인증·사진·앨범 및 두 작업 간 인터페이스는 [인증·앨범 연동 계약](docs/auth-albums-implementation.md)이 기준입니다. 두 기능의 Supabase 마이그레이션은 그룹 스키마를 먼저 적용한 뒤 앨범 스키마를 적용해야 합니다.
