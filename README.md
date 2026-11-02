# 공유 여행 계획 서비스

여행 그룹을 만들고 여행원을 초대해 여행지와 일정을 정하며, 공동 경비 정산과 사진 앨범 제작·공유를 제공하는 서비스입니다.

초기 구현은 `apps/web`의 Next.js + TypeScript와 Supabase를 사용합니다. 로그인은 Supabase Auth, 영구 저장과 권한 검사는 Supabase PostgreSQL/RLS, 사진은 비공개 Supabase Storage, 그룹 내 변경 알림은 Supabase Realtime을 사용합니다. 초기 버전은 별도 API 서버 없이 웹 앱에서 Supabase에 연결합니다.

## 폴더 구조

```text
Travel/
├── apps/
│   ├── web/                 # 웹 화면
│   └── api/                 # 보류: 초기 버전은 별도 API 서버를 사용하지 않음
├── packages/
│   └── contracts/           # 클라이언트·서버 간 데이터 및 API 규칙
├── docs/
│   ├── requirements.md      # 기능 요구사항과 결정할 사항
│   ├── domain-model.md      # 주요 데이터와 관계
│   ├── development-plan.md  # 구현 순서
│   └── auth-albums-implementation.md # 인증·앨범 구현 및 팀 연동 계약
├── infra/                   # 배포 및 인프라 설정
└── scripts/                 # 개발·운영 자동화
```

## 기능 구분

- `groups`: 여행 그룹 생성, 여행원 초대와 참여
- `trips`: 여행지와 여행 날짜 설정
- `expenses`: 결제 내역 등록 및 비용 분담
- `settlements`: 최종 정산 및 송금 안내
- `albums`: 여행 사진 수집과 앨범 제작·공유
- `posts`: 앨범 게시와 공개 범위 관리

## 구현 상태와 로컬 실행

- 인증·사진 업로드·그룹 앨범 화면과 RLS/Storage/Realtime 마이그레이션을 `feature/auth-albums` 브랜치에 구현했습니다.
- 그룹 생성·초대·멤버십 스키마는 팀원이 소유합니다. `groups(id)`와 `group_members(group_id, user_id)`가 준비되기 전에는 그룹 공유의 통합 검증을 할 수 없습니다.
- Supabase 설정과 공통 인증 모듈 사용법은 [웹 앱 안내](apps/web/README.md) 및 [인증·앨범 구현 및 연동 계약](docs/auth-albums-implementation.md)을 확인하세요.
- 웹 앱은 `cd apps/web && npm install && npm run dev`로 실행합니다.

기획은 [기능 요구사항](docs/requirements.md), [데이터 모델](docs/domain-model.md), [개발 순서](docs/development-plan.md)에서 확인할 수 있습니다.
