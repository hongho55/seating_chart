# Seating Chart Web App

교사가 다양한 교실 형태에서 좌석을 만들고, 조건을 걸어 자동 배치하고, 반별로 저장/인쇄할 수 있는 React + Vite 기반 웹앱입니다.

- 요구사항 문서: [PRD.md](/Users/hong/development/git/seating_chart/PRD.md)
- 기술 스택 제안: [ARCHITECTURE.md](/Users/hong/development/git/seating_chart/ARCHITECTURE.md)
- 현재 상태: 프로토타입 구현 완료

## 핵심 기능

- 1인, 2인, 4인, 6인 좌석 프리셋
- 드래그 기반 자리 편집
- 교사 관점 / 학생 관점 전환
- 완전 랜덤 / 조건 기반 랜덤 / 사전 설정 랜덤 연출
- 만나면 안 되는 학생 설정
- 학년 / 반 / 과목교실별 저장
- 자동저장 + 저장본 스냅샷
- 교사용 / 학생용 인쇄

## 실행 방법

```bash
npm install
npm run dev
```

## 현재 구현 범위

- 반 생성 및 샘플 반 제공
- 학생 일괄 등록
- 1인, 2인, 4인, 6인 프리셋 생성
- 좌석 선택, 좌석 이동, 학생 수동 배치
- 교사 관점 / 학생 관점 전환
- 완전 랜덤 + 성별 모드 기반 랜덤
- 만나면 안 되는 학생 규칙
- 좌석 고정
- 로컬 자동저장
- 저장본 스냅샷 복원
- 교사용 / 학생용 인쇄

## 저장 방식

- 현재 프로토타입은 `localStorage` 기반 자동저장을 사용합니다.
- 구조 문서는 `IndexedDB + Dexie` 확장을 기준으로 정리되어 있습니다.
