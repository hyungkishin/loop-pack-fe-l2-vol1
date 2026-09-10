# 10주차 AI 코드 리뷰

## 리뷰 위치

AI 리뷰는 CI required check가 아니라 로컬 advisory로 둔다. 모델 결과는 같은 diff에서도 달라질 수 있고, API 비용과 외부 장애가 merge 가능 여부를 결정하게 할 이유가 없다. 결정적으로 판별 가능한 지적은 검증한 뒤 lint·test·CI 규칙으로 옮긴다.

실행 정보는 다음과 같다.

| 항목 | 값 |
| --- | --- |
| 도구 | Codex CLI 0.154.0 |
| 모델 | gpt-6-astra |
| 실행일 | 2026-09-11 |
| 대상 | `git diff 5b29c432...HEAD` |
| 실행 모드 | read-only, ephemeral |

## 팀 규칙을 넣은 프롬프트

```text
현재 저장소의 아래 diff를 코드 리뷰하라. 파일을 수정하지 마라.

팀 규칙:
1. any, ts-ignore, eslint-disable 남용 금지
2. 파생값을 useState와 useEffect로 동기화 금지
3. FSD 상위 레이어 참조, cross-slice, Public API 우회 금지
4. 서버 응답을 클라이언트 store에 복사 금지
5. 화면은 analytics events의 타입 wrapper만 사용하고 logger의
   track, identify, reset을 직접 import하지 않음

correctness, CI false-green, secret exposure를 우선한다.
각 지적은 파일과 근거를 제시하고 확신이 낮으면 추측이라고 표시한다.
일반론은 쓰지 않는다.
```

규칙의 출처는 `AGENTS.md`, `docs/rfc/week06-fsd.md`, `docs/rfc/week09-e2e-scope.md`다. 모든 규칙을 새로 만들지 않고 이미 합의한 경계만 넣었다.

## 잘 잡은 리뷰

리뷰는 다음 우회를 실제 TypeScript module resolution과 ESLint 입력으로 재현했다.

> 확장자를 붙이면 원시 analytics import 제한을 우회합니다. `@/analytics/logger.js`는 ESLint 메시지가 없고 TypeScript는 실제 `src/analytics/logger.ts`로 해석했습니다.

기존 패턴은 `@/analytics/logger`와 `**/analytics/logger`만 막았다. `.js`를 붙인 import가 실제 `logger.ts`로 연결되는 것을 확인한 뒤 `logger.*` 패턴을 추가했다. 두 번째 리뷰가 찾은 동적 `import('@/analytics/logger')` 우회도 재현되어 `no-restricted-syntax`로 막았다.

환경 검증이 `process.env`만 보고 Next가 별도로 읽는 `.env.production`을 놓친다는 지적도 맞았다. `@next/env`의 production 로더를 사용하고 실제 `.env.production` fixture가 값 노출 없이 실패하는 테스트를 추가했다.

## 헛소리와 과잉 확신

초기 계획은 분리 전 로그의 Playwright 176초를 브라우저 다운로드에 귀속하고 browser cache를 해결책으로 제안했다.

> 확정된 대상 하나: Playwright 브라우저 캐시. cold 176초의 근거가 여기 있다.

분리 측정 결과 `install-deps`는 13~28초, Chromium 다운로드는 11초였다. 176초는 이후 네 번의 표본에서 재현되지 않았고 어느 하위 단계의 값인지도 알 수 없었다. `--only-shell` 실험도 다운로드 중앙값만 11초에서 6초로 줄였을 뿐 job 전체 중앙값은 112초로 같았다. 원인과 효과를 모두 확인하지 않은 단정이라 채택하지 않았다.

## 프롬프트를 고친 결과

처음에는 “개선할 점을 최소 5개”라고 요구했다. 개수를 채우는 조건 때문에 동작상 결함과 문서 보강 제안이 같은 목록에 섞였다. 다음 실행에서는 최소 개수를 없애고, 파일·재현 경로·팀 규칙 중 하나를 근거로 요구하며 확신이 낮으면 추측으로 표시하게 했다.

그 결과 리뷰의 역할이 바뀐다. AI는 후보를 찾는다. 정적 분석과 테스트는 참·거짓을 가른다. 실행 시간과 Actions 로그는 효과를 가른다. 최종 채택은 이 세 증거가 모인 뒤에만 한다.

## 결정적 룰로 승격

9주차 문서는 화면에서 원시 `track()`을 호출하지 않고 타입 wrapper를 쓰기로 정했다. 당시 architecture 검사기는 `src/analytics`를 레이어로 인식하지 않아 이를 강제하지 못했다.

ESLint의 `no-restricted-imports`는 analytics 외부에서 `track`, `identify`, `reset`의 정적 import를 막는다. alias, 상대경로, 확장자 표기를 모두 포함한다. `no-restricted-syntax`는 같은 logger의 동적 import를 막는다. analytics 내부 wrapper와 `flush`, 초기화 함수는 허용한다.

자가 검증 결과는 다음과 같다.

| 입력 | 결과 |
| --- | --- |
| `track` alias import | 실패 |
| `identify` 상대경로 import | 실패 |
| `track` `.js` 확장자 import | 실패 |
| logger 동적 import | 실패 |
| `flush` import | 통과 |
| 기존 `.test.ts` Testing Library 제한 | 계속 실패 |

원시 계측 함수의 import 여부는 맥락과 관계없이 판별할 수 있으므로 기계에 둔다. wrapper가 어떤 이벤트 이름과 프로퍼티를 가져야 하는지, 새 계측 SDK가 필요한지는 제품과 분석 맥락이 필요하므로 사람 리뷰에 남긴다. AI 리뷰는 그 사이에서 누락 후보를 찾지만 merge를 직접 막지 않는다.
