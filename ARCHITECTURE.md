# 자리 배치 웹앱 기술 스택 제안

## 결론

이 프로젝트는 `React + TypeScript + Vite` 조합이 가장 적합하다.

이유:

- SEO가 필요 없는 교사용 내부 도구에 가깝다.
- 핵심 난제는 서버 렌더링이 아니라 좌석 편집, 드래그, 자동 배치, 인쇄다.
- 교실에서 인터넷이 불안정해도 사용할 수 있게 `로컬 우선 저장`이 유리하다.
- 빠르게 프로토타입을 만들고 유지보수하기 좋다.

## 추천 스택

### 프론트엔드

- React
- TypeScript
- Vite
- React Router

### 상태 관리

- Zustand

이유:

- 전역 상태가 필요하지만 Redux 수준의 복잡도는 불필요하다.
- 현재 앱은 반 정보, 학생 목록, 좌석, 규칙, 인쇄 옵션 정도를 다루므로 가볍게 시작하는 편이 좋다.

### 로컬 저장

- IndexedDB
- 구현 라이브러리: Dexie

이유:

- 학생, 좌석, 규칙, 스냅샷처럼 구조화된 데이터를 저장하기 쉽다.
- 반이 많아져도 `localStorage`보다 안전하고 확장성이 좋다.
- 비동기 저장이라 UI를 덜 막는다.

### 드래그앤드롭

- `dnd-kit` 권장

이유:

- 좌석 이동, 학생 이동, 다중 선택 뒤 그룹 지정 같은 상호작용을 만들기 좋다.

### 인쇄

- 브라우저 기본 인쇄 + 인쇄 전용 CSS

이유:

- 교사용/학생용 출력은 별도 PDF 엔진보다 브라우저 인쇄 스타일로 충분히 대응 가능하다.

## 왜 Next.js보다 React + Vite가 더 맞는가

Next.js가 나쁜 선택은 아니지만, 이 프로젝트의 첫 버전에는 과한 편이다.

Next.js가 덜 맞는 이유:

- SSR, SEO, 서버 액션이 핵심 가치가 아니다.
- 첫 버전에서 가장 중요한 것은 좌석 편집기와 로컬 저장이다.
- 인쇄, 캔버스형 편집, 드래그 중심 UI는 클라이언트 앱 성격이 강하다.

Next.js를 고려할 상황:

- 교사 로그인
- 여러 기기 간 동기화
- 학교 단위 계정 관리
- 온라인 공유 링크

그 전까지는 `React + Vite`가 더 단순하고 빠르다.

## 저장 기능 설계

## 저장은 꼭 들어가야 한다

이 앱에서 저장은 선택 기능이 아니라 핵심 기능이다.

저장해야 할 대상:

- 학년, 반, 교실 정보
- 학생 명단
- 좌석 레이아웃
- 모둠 묶음 정보
- 고정 좌석 정보
- 금지 규칙
- 랜덤 배치 옵션
- 인쇄 옵션
- 최종 배치 결과

## 추천 저장 방식

### 1. 자동저장

- 편집 중 변경이 생기면 자동 저장
- 예: 500ms~1000ms 디바운스 후 저장
- 사용자는 저장 유무를 신경 쓰지 않아도 된다

### 2. 명시적 저장본

- `현재 배치 저장`
- `새 저장본으로 저장`

이유:

- 자동저장만 있으면 이전 상태로 돌아가기 어렵다.
- 전담 교사는 비슷한 배치를 여러 반에 복제해서 써야 한다.

### 3. 스냅샷

- 반별로 여러 배치 버전을 남긴다.
- 예: `1학년 3반 - 3월 과학실 배치`, `중간고사 시험형 배치`

### 4. 템플릿 저장

- 좌석 구조 자체를 템플릿으로 저장
- 예: `과학실 6인 모둠 4개`, `시험형 1인 28석`

## localStorage 대신 IndexedDB를 추천하는 이유

`localStorage`는 간단한 키/값 저장에는 좋지만 동기식이라 데이터가 커질수록 UI에 부담이 된다.

이 앱은 다음 데이터를 다룬다.

- 학생 배열
- 좌석 좌표
- 규칙 목록
- 배치 스냅샷

따라서 첫 버전부터 IndexedDB를 쓰는 편이 낫다.

`localStorage`는 아래 정도만 저장하면 충분하다.

- 마지막으로 연 반
- 마지막 보기 모드
- 최근 사용 인쇄 옵션

## 추천 저장 구조

### classes

- id
- grade
- className
- subjectRoomName
- createdAt
- updatedAt

### students

- id
- classId
- number
- name
- gender
- absent
- note

### layouts

- id
- classId
- name
- boardDirection
- teacherDeskPosition
- createdAt
- updatedAt

### seats

- id
- layoutId
- x
- y
- type
- rotation
- groupId

### groups

- id
- layoutId
- label
- type
- color

### rules

- id
- classId
- type
- studentAId
- studentBId
- value

### snapshots

- id
- classId
- layoutId
- name
- placementData
- createdAt

## MVP 구현 추천

첫 구현은 아래 조합을 권장한다.

- React
- TypeScript
- Vite
- React Router
- Zustand
- Dexie

이 조합이면 `오프라인 저장`, `빠른 개발`, `복잡한 편집 UI`, `인쇄 대응`을 가장 무리 없이 맞출 수 있다.

## 나중에 붙이면 좋은 것

- Supabase: 로그인, 백업, 기기 간 동기화
- PWA: 설치형 앱처럼 사용
- 서버 백업: 학교 PC와 개인 노트북 간 동기화
