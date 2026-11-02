# 공유 여행 계획 서비스

여행 그룹을 만들고 여행원을 초대해 여행지와 일정을 정하며, 공동 경비 정산과 사진 앨범 제작·공유를 제공하는 서비스입니다.

Next.js + TypeScript + Supabase 기반으로 그룹·여행·결제·정산 기능을 구현했습니다. 로그인 화면과 앨범은 팀원 담당이며 아직 연결하지 않았습니다. 데이터 기능을 사용하려면 Supabase 환경변수, SQL 마이그레이션 적용, 실제 로그인 세션이 필요합니다.

## 로컬 실행

Node.js 22 이상 (권장: 24 LTS)에서 루트 폴더 기준으로 실행합니다.

```sh
npm ci
cp apps/web/.env.example apps/web/.env.local
# .env.local에 Supabase URL과 publishable key 입력
npm run dev
```

http://localhost:3000 에서 확인합니다. DB 적용과 두 계정 검증은 [실행 안내](docs/groups-settlement-setup.md), 인증 연동 계약은 [구현 초안](docs/groups-settlement-design.md)을 참고하세요.

```sh
npm test
npm run typecheck
npm run build
```

## 폴더 구조

```text
Travel/
├── apps/
│   ├── web/                 # 웹 화면
│   └── api/                 # 예약 폴더 (현재 별도 서버 없음)
├── packages/
│   └── contracts/           # 클라이언트·서버 간 데이터 및 API 규칙
├── docs/
│   ├── requirements.md      # 기능 요구사항과 결정할 사항
│   ├── domain-model.md      # 주요 데이터와 관계
│   └── development-plan.md  # 구현 순서
├── infra/                   # 배포 및 인프라 설정
├── scripts/                 # 개발·운영 자동화
└── supabase/migrations/     # DB 스키마·RLS·트랜잭션 RPC
```

## 기능 구분

- `groups`: 여행 그룹 생성, 여행원 초대와 참여
- `trips`: 여행지와 여행 날짜 설정
- `expenses`: 결제 내역 등록 및 비용 분담
- `settlements`: 최종 정산 및 송금 안내
- `albums`: 여행 사진 수집과 앨범 제작·공유
- `posts`: 앨범 게시와 공개 범위 관리

기획은 [기능 요구사항](docs/requirements.md), [데이터 모델](docs/domain-model.md), [개발 순서](docs/development-plan.md)에서 확인할 수 있습니다.

기존 기획 문서는 장기 범위입니다. 현재 구현은 그룹당 여행 하나, 원화·균등 분담, 현재 결제 기준 정산이며 구현 초안 문서가 상세 기준입니다.
