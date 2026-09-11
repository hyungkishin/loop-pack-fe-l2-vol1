# 10주 기술 회고

## 1. 프로젝트 요약

상품 탐색, 장바구니·위시리스트, 로그인과 주문 흐름을 가진 Next.js 애플리케이션이다. 결과물보다 경계를 검증하는 방식이 10주 동안 바뀌었다. 현재 CI는 architecture, 단위·DOM 375개, Storybook 18개, lint, typecheck, 환경 변수, production build, 번들 예산과 조건부 E2E 12개를 한 `quality` 상태로 보고한다.

## 2. 구조 변화

초기 구조는 상품 표현과 장바구니·위시리스트 행위가 한 컴포넌트와 store에 섞여 있었다. 6주차에는 FSD의 의존 방향에 맞춰 entities는 표현, features는 행위, widgets와 pages는 조합을 맡겼다. 구조 검사는 현재 164파일과 518개 import, Public API 3개를 확인한다.

이동 자체를 목표로 두지 않았다. 위시리스트를 제거해도 cart capability의 모델과 테스트가 바뀌지 않는지를 성공 기준으로 삼았다. 서버 응답은 TanStack Query cache, 검색 조건은 URL, 장바구니·위시리스트는 Zustand를 원본으로 두어 같은 값을 여러 저장소에 복사하지 않았다.

## 3. 주요 기술 결정

첫째, URL을 상품 목록 조건의 원본으로 삼았다. 공유·새로고침·뒤로 가기에서 같은 조건을 복원해야 하므로 React state와 URL을 양방향으로 맞추지 않았다. query key와 API 요청도 정규화한 URL 조건에서 파생한다.

둘째, 세션 만료 처리는 각 화면이 아니라 QueryCache와 서버 경계에 모았다. 화면마다 401을 해석하면 같은 응답이 서로 다른 안내와 이동을 만들 수 있다. 보호 경로는 Proxy와 서버 초기 HTML이 맡고, 브라우저 E2E는 쿠키·redirect·원래 경로 복원을 함께 확인한다.

셋째, E2E 범위는 빈도가 아니라 브라우저 경계와 실패 비용으로 골랐다. 7,514개 유효 세션에서 로그인 성공은 7.8%, 주문 완료는 3.7%였지만 실패하면 거래와 보호 기능 전체가 막힌다. 목록 조건은 DOM 통합 테스트로 같은 보증을 더 싸게 얻을 수 있어 별도 E2E에서 제외했다.

## 4. 테스트와 품질 게이트

8주차에는 순수 로직, DOM, 네트워크 경계와 production browser를 분리했다. 9주차에는 12개 E2E를 workers 1과 4에서 실행하고 신규 인증·주문 6개를 3회 반복했다. 결함 주입 7건 중 최초에 살아남은 cookie `httpOnly`, 보호 링크 prefetch와 서버 초기 HTML 공백은 단언을 보완한 뒤 다시 검출했다.

10주차에는 `pnpm check` 한 줄을 named step으로 나눴다. warm 3회의 job 중앙값은 112초, 범위는 111~130초였다. Playwright 176초가 browser download라는 초안은 재현되지 않았다. 실제 중앙값은 system deps 14초, download 11초였다.

모든 PR에서 architecture, test, lint, type, environment, build와 bundle을 실행한다. E2E는 실행 경로가 바뀐 PR과 push에서만 실행한다. 소스 PR [#3](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/3)은 E2E를 실행했고 문서 PR [#4](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/4)은 E2E를 생략하면서 둘 다 `quality` 상태를 보고했다.

## 5. 성능 개선 결과

7주차 홈 LCP 중앙값은 42,175ms에서 3,384ms로 줄었다. 범위는 각각 42,169~42,184ms와 3,264~3,387ms였다. 감으로 preload를 붙이지 않고 요청 시각과 hero geometry를 분리해 이미지 후보와 폰트 burst를 측정했다.

10주차 번들 예산은 Lighthouse 전송량과 다른 값을 섞지 않았다. 같은 Next 16.2.10 build의 최초 로드 비압축 JS를 다시 측정했다. 현재 3회 값은 홈 602,487B, 상품 목록 619,069B로 편차가 0B였다. 현재값보다 약 5% 높은 618KiB와 635KiB를 merge 차단선으로 둔다.

## 6. CI/CD와 AI 협업

CI는 같은 명령을 반복하는 장치에서 실패 귀속을 남기는 장치로 바뀌었다. commit SHA, run URL, cache 상태와 step 시간을 함께 기록한다. `concurrency`는 PR의 이전 실행만 취소하고 main push와 수동 측정은 취소하지 않는다. workflow 권한은 `contents: read`로 제한했다.

Vercel Production(`loop-commerce-week10.vercel.app`)과 별도 Preview URL을 만들었다. 두 환경에서 홈, 상품 목록, 로그인 계약으로 제한한 smoke 3개가 각각 4.7초와 3.8초에 통과했다. Preview의 첫 실행은 Vercel 로그인 화면으로 이동해 실패했다. 이 프로젝트는 mock 데이터만 제공하므로 Preview 보호를 해제했고, 앱의 요소 계약까지 다시 통과한 뒤 배포 성공으로 판정했다.

Docker는 `.nvmrc`와 같은 Node 24.17.0, pnpm 10.15.1에서 환경 검증과 production build를 실행한다. 89,020,786B의 standalone runner는 비 root `nextjs` 사용자가 `node server.js`를 실행한다. 컨테이너 URL에서 같은 smoke 3개가 1.5초에 통과했다. Vercel은 현재 운영 선택이고 Docker는 컨테이너 표준이나 VPC 제약이 생길 때 사용할 이식 경계로 남긴다.

## 7. AI 활용 회고

AI는 workflow 분리, 스크립트 골격과 리뷰 후보를 만드는 데 썼다. 그러나 첫 계획은 분리 전 176초를 browser download로 단정해 효과 없는 cache를 제안했다. 측정 후 `--only-shell`은 download 중앙값을 11초에서 6초로 줄였지만 job 중앙값은 112초로 같아 채택하지 않았다.

반대로 코드 리뷰는 `.env.production` 미검사, E2E 경로 필터 누락, logger import의 확장자·동적 import 우회를 찾았다. 각각 fixture, Git diff와 ESLint 입력으로 재현한 뒤 고쳤다. 원시 계측 호출처럼 참·거짓을 구문으로 가를 수 있는 규칙은 ESLint error로 내렸다. 이벤트 설계, E2E 범위와 성능 회귀 해석은 제품 맥락이 필요하므로 사람 판단에 남겼다.

## 8. 다시 만든다면

처음부터 측정 명령과 결과 스키마를 기능 코드와 함께 둔다. 7주차 Lighthouse 전송량과 10주차 Next 비압축 번들처럼 단위가 다른 값은 같은 이름으로 부르지 않는다. CI도 처음부터 named step으로 두면 176초를 잘못 귀속하는 일을 피할 수 있다.

환경 계약도 초기에 한 모듈로 고정한다. 현재 `APP_ORIGIN` 검증과 애플리케이션의 `getAppOrigin`은 같은 사례를 별도 코드로 판정한다. 다음 구조 변경에서는 공용 schema를 서버 코드와 build 검증이 함께 사용하게 해 판단 중복을 제거한다.
