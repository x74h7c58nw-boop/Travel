# 공유 여행 계획 서비스

여행 그룹을 만들고 여행원을 초대해 여행지와 일정을 정하며, 공동 경비 정산과 사진 앨범 제작·공유를 제공하는 서비스입니다.

현재는 개발을 시작하기 위한 폴더와 기획 문서만 구성한 상태입니다. 프레임워크, 데이터베이스, 패키지 관리 도구는 아직 선택하지 않았습니다.

## 폴더 구조

```text
Travel/
├── apps/
│   ├── web/                 # 웹 화면
│   └── api/                 # 서버 API와 비즈니스 로직
├── packages/
│   └── contracts/           # 클라이언트·서버 간 데이터 및 API 규칙
├── docs/
│   ├── requirements.md      # 기능 요구사항과 결정할 사항
│   ├── domain-model.md      # 주요 데이터와 관계
│   └── development-plan.md  # 구현 순서
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

기획은 [기능 요구사항](docs/requirements.md), [데이터 모델](docs/domain-model.md), [개발 순서](docs/development-plan.md)에서 확인할 수 있습니다.
