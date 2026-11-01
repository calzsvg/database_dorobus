# 도로버스 핵심 ERD

17개 테이블의 논리 관계다. 같은 이름의 테이블이 여러 그림에 나와도 실제로는 하나다. `||`는 정확히 한 개, `o{`는 0개 이상, `o|`는 0개 또는 한 개를 의미한다. [컬럼 정의](table-definitions.md)와 [실제 생성 SQL](../migrations/001_init.sql)을 함께 참고한다.

## 사용자·수업·과제

```mermaid
erDiagram
    users ||--o{ class_groups : "강사로 담당"
    courses ||--o{ class_groups : "개설"
    users ||--o{ enrollments : "수강"
    class_groups ||--o{ enrollments : "수강생 등록"
    class_groups ||--o{ assignments : "과제 배정"
    content_versions ||--o{ assignments : "출제에 사용"
```

courses는 교육 내용이고 class_groups는 실제 개설한 반이다. enrollments는 학생과 반을 연결한다. assignments는 반에 어떤 문제 버전을 출제했는지 저장한다.

## 문제·풀이·완료

```mermaid
erDiagram
    contents ||--o{ content_versions : "버전 보관"
    users ||--o{ learning_attempts : "답안 제출"
    content_versions ||--o{ learning_attempts : "풀이 대상"
    assignments o|--o{ learning_attempts : "출제 맥락"
    users ||--o{ content_completions : "문제 완료"
    contents ||--o{ content_completions : "완료 대상"
    content_versions ||--o{ content_completions : "완료한 버전"
```

문제 하나를 두 반에 내도 contents는 하나다. 세 번 제출하면 learning_attempts에 세 행을 남기고, 최초 완료는 content_completions에 한 행을 남긴다. 풀이의 과제·버전 일치와 완료 기록의 문제·버전 일치는 SQL의 복합 FK가 검사한다.

## 스토리·선택 상태

```mermaid
erDiagram
    users ||--o{ user_story_progress : "스토리 진행"
    story_steps ||--o{ user_story_progress : "단계 완료"
    users ||--o| player_profiles : "현재 설정"
    class_groups o|--o{ player_profiles : "선택한 반"
    content_versions o|--o{ player_profiles : "진행할 월드 문제"
    items o|--o{ player_profiles : "구매 목표"
```

story_steps는 공통 단계, user_story_progress는 개인의 완료 기록이다. player_profiles는 현재 선택과 화면 설정이며 수강·풀이 이력 전체를 대신하지 않는다.

## CELL·상점·보상

```mermaid
erDiagram
    users ||--o| wallets : "CELL 지갑"
    users ||--o{ cell_transactions : "증감 내역"
    users ||--o{ reward_claims : "보상 수령"
    users ||--o{ user_items : "가구 보유"
    items ||--o{ user_items : "보유 대상"
```

wallets는 현재 잔액, cell_transactions는 잔액이 바뀐 이유다. items는 상품 정보, user_items는 사용자의 보유 기록이다. reward_claims는 같은 보상의 중복 수령을 막는다. operation_id는 지급 작업 추적용 값이며 이 그림의 별도 FK가 아니다.
