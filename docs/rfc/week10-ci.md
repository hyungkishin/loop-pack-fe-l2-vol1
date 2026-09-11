# 10주차 CI — 측정과 조건부 실행

## A. 측정 방법

같은 커밋에서 반복 실행하고, 실행마다 run URL · commit SHA · 캐시 상태 · 스텝별 시간을 남긴다.

**측정 PR** — 포크 안에 `feature/week10 → measure/week10-base` PR을 연다(`hyungkishin/loop-pack-fe-l2-vol1#2`). 베이스를 커밋 1 직전 SHA(`5b29c432`)로 잡아 diff를 workflow 한 파일로 제한했다. 포크의 `main`은 1주차 시점에 멈춰 있어 그리로 열면 10주치 3만 줄이 잡히고 경로 판정 실험까지 오염된다.

**이 PR은 병합 대상이 아니다.** `main`에 합칠 수 있는지를 보는 PR이 아니라 PR 이벤트에서 workflow가 어떻게 동작하는지 재는 실험 PR이다. required status check와 branch protection 검증은 최종 upstream PR에서 따로 한다.

**반복 실행 수단** — `workflow_dispatch`는 workflow가 기본 브랜치에 있어야 동작한다. 이 변경이 `main`에 들어가기 전까지는 Actions의 Re-run jobs를 쓰고, 병합 이후에는 `workflow_dispatch`를 쓴다.

**최초 실행은 통계에서 뺀다.** 캐시가 없는 상태라 조건이 다르다. 별도로 표기한다.

### 캐시 상태 표기

| 대상 | 상태 |
| --- | --- |
| pnpm store (`setup-node`의 `cache: pnpm`) | hit / miss 구분 |
| Playwright browser cache | **미적용** |
| runner | 매 실행 새 GitHub-hosted runner |

Playwright 설치를 hit/miss로 부르지 않는다. 캐시를 걸지 않았으므로 매 실행 새로 받는다.

## B. 기준 측정 (커밋 `e72b8d93`)

run `34498716030` · https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34498716030

| 실행 | pnpm store | job 전체 |
| --- | --- | ---: |
| 최초 (시도 1) | miss | 115s |
| Re-run 1 | hit | 111s |
| Re-run 2 | hit | 130s |
| Re-run 3 | hit | 112s |

pnpm hit 3회 기준 **중앙값 112s, 범위 111~130s**.

서로 다른 무해한 lockfile 주석으로 setup-node의 key를 세 번 바꿨다. 세 로그 모두 `pnpm cache is not found`를 출력하고 서로 다른 key를 저장했다. 브라우저 캐시는 세 실행 모두 적용하지 않았다.

| cold 실행 | PR | install | job 전체 | Actions |
| --- | --- | ---: | ---: | --- |
| 1 | [#6](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/6) | 4.9s | 107s | [run 34541863877](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34541863877) |
| 2 | [#8](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/8) | 6.0s | 115s | [run 34541865636](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34541865636) |
| 3 | [#7](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/7) | 6.1s | 103s | [run 34541866613](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34541866613) |

cold 중앙값은 **107s, 범위 103~115s**다. install 중앙값은 6.0s로 warm의 2s보다 4s 길지만 job 전체는 runner 변동에 묻혀 cold가 더 느리다고 볼 수 없다. 캐시 hit은 의존성 설치 구간을 줄인다는 범위까지만 증명한다.

| 스텝 | R1 | R2 | R3 | 중앙값 |
| --- | ---: | ---: | ---: | ---: |
| Install dependencies | 2 | 2 | 2 | 2 (miss일 때 7) |
| Install Playwright system deps | 14 | 28 | 13 | 14 |
| Download Playwright Chromium | 11 | 11 | 11 | 11 |
| Architecture check | 1 | 1 | 0 | 1 |
| Unit and DOM tests | 20 | 17 | 20 | **20** |
| Storybook tests | 9 | 10 | 8 | 9 |
| Lint | 5 | 4 | 5 | 5 |
| Typecheck | 4 | 4 | 4 | 4 |
| Build | 11 | 10 | 10 | 10 |
| Build Storybook | 3 | 4 | 4 | 4 |
| E2E | 14 | 14 | 14 | 14 |

### 스텝을 나누기 전에는 지목할 수 없었다

GitHub Actions는 스텝 단위로만 시간을 기록한다. 이전 workflow는 `pnpm check` 한 줄로 여덟 검증을 직렬 실행해 로그에 총합 65초만 남았고, Playwright도 `install --with-deps` 하나라 apt 의존성과 브라우저 다운로드가 한 단계로 합쳐져 있었다.

### 가설이 깨진 지점

작업 전 관측한 기존 run 2건에서 Playwright 설치가 176초로 찍혀 있었다. 그것을 브라우저 다운로드로 귀속한 초안의 결론은 **표본 4개에서 재현되지 않았다.** `install-deps` 13~28초 + 다운로드 11초로 합쳐 24~39초다.

특히 다운로드 11초는 **세 표본에서 편차가 0**이다. 여기에 캐시를 붙여도 최대 11초를 아끼는데 복원 비용을 빼면 남는 것이 거의 없다. Playwright 공식 문서가 브라우저 캐시를 권장하지 않는 근거와 측정이 일치한다. **브라우저 캐시는 채택 후보에서 내린다.**

## C. 개선 대상 선정

setup 구간(2 + 14 + 11 = 27s)과 검증 체인(65s)으로 갈린다.

**검증 항목과 실행 횟수는 유지한다.** 병렬화는 설치 중복과 산출물 전달 비용을 측정하기 전까지 적용하지 않는다. `test:e2e:prebuilt`가 앞 단계의 `.next`를 쓰기 때문에 job을 나누면 산출물을 artifact로 넘기거나 다시 build해야 하고, 그 비용을 재지 않은 상태에서 병렬화를 채택할 근거가 없다.

### 실험 A — chromium 다운로드를 headless shell로 좁힌다

현재 다운로드 스텝은 셋을 받는다.

```
Chrome for Testing 151.0.7922.34
FFmpeg (playwright ffmpeg v1011)
Chrome Headless Shell 151.0.7922.34
```

이 저장소는 channel 지정 없이 headless로만 쓴다 — `playwright.config.ts`의 chromium 프로젝트, `vitest.config.ts`의 storybook 프로젝트(`headless: true`).

**채택 기준 (실험 전 고정)**

```
기능 검증 동일 (Storybook 18 · E2E 12 통과)
AND setup 중앙값이 측정 편차보다 크게 감소
AND job 전체 중앙값도 감소
```

다운로드 스텝만 줄고 job 전체가 기존 범위 111~130s 안에 머무르면 "다운로드는 줄었지만 전체 개선은 판정 불가"로 기록한다.

**결과** — SHA `340d77f6`, 3회, 전부 pnpm hit. run [`34505357684`](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34505357684)

| 항목 | R1 | R2 | R3 | 중앙값 | baseline 중앙값 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Download Chromium | 6 | 7 | 5 | **6s** | **11s** (편차 0) |
| Install Playwright system deps | 14 | 15 | 15 | 15s | 14s (범위 13~28) |
| Install dependencies | 2 | 2 | 3 | 2s | 2s |
| setup 합 | 22 | 24 | 23 | **23s** | **27s** |
| job 전체 | 112 | 114 | 109 | **112s** | **112s** (범위 111~130) |

다운로드 대상이 실제로 좁혀졌다.

```
before   Chrome for Testing 151.0.7922.34
         FFmpeg (playwright ffmpeg v1011)
         Chrome Headless Shell 151.0.7922.34

after    FFmpeg (playwright ffmpeg v1011)
         Chrome Headless Shell 151.0.7922.34
```

기능 검증은 3회 모두 동일하다 — 단위·통합 375(48파일), Storybook 18(7파일), E2E 12. pnpm 캐시는 3회 모두 `Cache restored from key: node-cache-Linux-x64-pnpm-a0d0503a…`.

**판정 — 채택하지 않는다.**

`--only-shell`은 다운로드 단계를 중앙값 11초에서 6초로 줄였고, 다운로드 대상에서 Chrome for Testing을 제거했다. 그러나 setup 중앙값 감소는 `install-deps`의 변동 범위에 포함됐으며 job 전체 중앙값은 112초로 변하지 않았다. 사전에 정한 채택 기준을 충족하지 못했으므로 workflow에는 반영하지 않는다. 176초 이상치 감소 가능성은 이번 실험으로 검증되지 않아 근거로 사용하지 않는다.

이상치를 근거로 쓸 수 없는 이유를 남긴다. 그 값은 스텝을 분리하기 전 단일 스텝에서 관측했고, 시스템 의존성과 브라우저 다운로드를 구분할 수 없으며, 현재 조건에서 재현되지 않았다. 다운로드 용량 감소가 이상치 발생 확률을 낮추는지도 측정하지 않았다.

실험 커밋(`340d77f6`)은 히스토리에 남기고 복구를 별도 커밋으로 뒀다. 다운로드가 실제로 병목이 되는 날 이 측정이 출발점이 된다.

### 실험하지 않고 기각한 것 — `install-deps` 제거

`install-deps` 스텝은 13~28초로 변동이 가장 크다. 제거하면 현재 runner에서 통과할 가능성이 있다.

그래도 실험하지 않는다. GitHub `ubuntu-latest` 이미지에 우연히 설치된 시스템 패키지 구성에 의존하기 때문이다. 3회 통과해도 runner 이미지가 갱신되면 다시 깨진다. Playwright의 공식 CI 계약도 Linux에서 `install --with-deps` 또는 동등한 의존성 설치를 요구한다. E2E 통과는 현재 이미지가 충분조건임을 보일 뿐, 미래 runner에서도 안전하다는 보장이 아니다.

## D. 조건부 E2E

`quality` job은 모든 PR에서 실행한다. architecture, unit, DOM, Storybook, lint, typecheck, 환경 변수, production build와 번들 예산도 조건을 붙이지 않는다. E2E 스텝만 PR의 base와 head 사이에 실행 경로가 바뀌었을 때 실행한다.

실행 대상은 `src`, `public`, `e2e`, `scripts`, `.storybook`, workflow, 환경 파일, Node·pnpm 설정, lockfile과 각종 config다. 이 목록 중 하나라도 바뀌면 E2E를 실행한다. push와 수동 실행도 항상 실행한다. 반대로 문서만 바뀌면 production build 결과와 브라우저 흐름이 바뀌지 않으므로 생략한다.

별도 E2E job과 guard를 만들지 않았다. `test:e2e:prebuilt`는 같은 job 앞부분의 `.next`를 사용한다. job을 나누면 build artifact를 전달하거나 같은 build를 반복해야 한다. 단일 `quality` job 안에서 E2E 스텝만 생략하면 required status는 항상 보고되고 산출물도 그대로 재사용한다.

| 측정 PR | 변경 | E2E 결과 | Quality | Actions |
| --- | --- | --- | --- | --- |
| [#3](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/3) | `src` 측정 파일 | 실행·성공 | 성공 | [run 34540029109](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34540029109) |
| [#4](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/4) | 문서 측정 파일 | skipped | 성공 | [run 34540029859](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34540029859) |

재시도는 0회로 유지한다. 조건 기반 대기를 쓰는 12개 테스트가 직렬·병렬·3회 반복에서 안정적으로 통과했다. 재시도를 켜면 실패 원인 대신 두 번째 시도의 성공 여부를 보게 된다. 실패한 최초 실행의 trace·screenshot·video는 7일간 artifact로 보존한다.

## E. 번들 예산

7주차 Lighthouse의 `script.transferSize`는 네트워크 전송량이다. Next 16의 `firstLoadUncompressedJsBytes`와 단위가 달라 직접 비교하지 않는다. 기준 커밋과 현재 커밋을 모두 Next 16.2.10으로 다시 build해 `.next/diagnostics/route-bundle-stats.json`의 같은 필드를 읽었다.

| 커밋 | 상태 | `/` | `/products` |
| --- | --- | ---: | ---: |
| `3aa1981` | 7주차 최적화 전 | 589,937 B | 599,696 B |
| `0785d2c` | 홈 최적화 후 | 591,786 B | 608,043 B |
| `36e31e0` | 상품 목록 최적화 후 | 591,786 B | 608,043 B |
| `9ae3fa6f` | 10주차 현재, 3회 | 602,487 B | 619,069 B |

현재 3회는 두 라우트 모두 편차가 0 B다. 8·9주차 인증·주문·계측 이후 홈은 10,701 B, 상품 목록은 11,026 B 늘었다. 현재값에서 약 5%를 허용해 홈 618 KiB, 상품 목록 635 KiB를 예산으로 둔다. 5%는 현재 기능 추가 한 번 정도의 증가를 허용하면서, 30 KiB가 넘는 신규 의존성이나 공통 청크 증가는 검토 대상으로 돌리는 경계다.

`pnpm size:check`는 build 뒤에 실행한다. 라우트, 현재값, 예산, 차이와 결과를 `$GITHUB_STEP_SUMMARY`에 쓴다. 700,000 B fixture를 넣은 로컬 자가 검증에서는 홈이 683.6 KiB, 예산이 618.0 KiB, 초과량이 65.6 KiB라고 표시하고 종료 코드 1을 반환했다.

원격 측정 PR [#5](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/pull/5)에서는 홈 예산만 500 KiB로 낮추고 이에 맞춘 단위 테스트를 먼저 통과시켰다. [run 34541923894](https://github.com/hyungkishin/loop-pack-fe-l2-vol1/actions/runs/34541923894)는 production build 뒤 `Check bundle budget`에서 실패했다. 출력과 summary에는 현재 588.4 KiB, 예산 500.0 KiB, 초과 88.4 KiB가 표시됐다. 첫 시도는 fixture의 고정 기대값이 먼저 실패해 게이트 증거로 사용하지 않았다.

### 예산표에 없는 라우트를 통과시키던 구멍

처음 구현은 `ROUTE_BUDGETS`의 키만 순회했다. 진단 파일에 있는데 예산표에 없는 라우트는 표에 나타나지도 않고 통과했다. `/checkout`에 5,000,000 B를 넣은 fixture로 확인했더니 종료 코드 0이었다. **라우트를 새로 만드는 것만으로 예산 게이트를 빠져나갈 수 있었다.**

두 목록 중 하나에 이름이 있어야 통과하게 바꿨다. 예산을 정하거나, 이유를 적고 제외한다. 임계값은 모두 같은 정책이다 — 같은 build에서 3회 측정해 편차가 0인 현재값에 5%를 더하고 KiB로 올림한다.

| 라우트 | 현재 | 예산 | 근거 |
| --- | ---: | ---: | --- |
| `/` | 602,487 B (588.4 KiB) | 618 KiB | 7주차 추이 위의 표 |
| `/products` | 619,069 B (604.6 KiB) | 635 KiB | 7주차 추이 위의 표 |
| `/login` | 576,958 B (563.4 KiB) | 592 KiB | 10주차 현재값 |
| `/orders` | 583,526 B (569.8 KiB) | 599 KiB | 10주차 현재값 |
| `/orders/new` | 577,350 B (563.8 KiB) | 593 KiB | 10주차 현재값 |

| 예산을 두지 않는 라우트 | 이유 |
| --- | --- |
| `/_not-found` | Next 내부 라우트다. 제품 화면이 아니고 공통 청크만 싣는다. |
| `/playground` | 컴포넌트 확인용 실습 화면이다. 제품 표면이 아니다. |
| `/performance-lab/inp` | 7주차 INP 측정 실습 화면이다. 측정 대상을 일부러 무겁게 두는 자리다. |

실제 build 산출물 8개 라우트로 실행하면 종료 코드 0, 같은 입력에 `/checkout`을 더하면 종료 코드 1과 `예산 미등록 라우트: /checkout`이다. 세 케이스를 `route-bundle.test.mjs`에 넣었다.

이 스크립트는 Next 16.2.10의 진단 파일 계약에 의존한다. 파일이나 필수 라우트가 없으면 통과시키지 않고 실패한다. Next를 올릴 때 진단 파일 구조와 측정 단위를 함께 재검토한다.

## F. 환경 변수 게이트

현재 production build의 필수 설정은 서버가 자기 API를 부를 때 쓰는 `APP_ORIGIN`이다. 값이 없거나 절대 URL이 아니거나 http(s)가 아니면 `pnpm env:check`가 실패한다. Next와 같은 production 환경 로더로 `.env.production.local`, `.env.local`, `.env.production`, `.env`도 먼저 읽는다.

이름이 `NEXT_PUBLIC_`으로 시작하면서 `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`, `API_KEY`, `ACCESS_KEY`를 포함하면 브라우저 노출 후보로 거부한다. 오류에는 변수 이름만 쓰고 값은 쓰지 않는다. mock 인증의 `AUTH_SESSION_SECRET`은 현재 코드가 과제용 기본값을 명시한 상태라 필수 목록에 넣지 않았다. 실제 백엔드로 전환할 때 기본값을 제거하고 Preview·Production 필수 변수로 승격한다.

자가 검증은 누락, 상대 URL, ftp URL, 공개 비밀 변수와 `.env.production` 입력을 모두 실패시켰다. 성공·실패 결과는 build 전에 summary에 남는다.

### 게이트를 우회하던 build 기본값

`appOrigin.ts`는 "기본값은 두지 않는다. 조용한 localhost 기본값이 불일치를 숨기고 결과물에 굳는다"를 주석으로 명시하고 있었다. 그런데 `Dockerfile`의 builder 단계가 `ARG APP_ORIGIN=http://127.0.0.1:3000`으로 그 기본값을 채워 넣었다. `--build-arg` 없이 빌드해도 `env:check`가 그 값으로 통과했고, runner 단계에는 값이 아예 없어 `-e` 없이 실행하면 요청마다 `getAppOrigin`이 던졌다. **게이트가 막으려던 설정 사고가 게이트 안쪽에 있었다.**

기본값을 없애고 runner에도 같은 값을 굽는다.

| 실행 | 결과 |
| --- | --- |
| `docker build` (인자 없음) | builder 단계 0.4초에 `APP_ORIGIN이 없습니다`로 실패 |
| `docker build --build-arg APP_ORIGIN=http://127.0.0.1:3100` | 성공, 이미지 `Config.Env`에 `APP_ORIGIN=http://127.0.0.1:3100` |
| 컨테이너 3100 포트에 smoke 3개 | 1.4초에 3개 통과 |

`docker run -e APP_ORIGIN=...`으로 덮어쓸 수 있다. build와 runtime 값이 같아야 하는 제약은 그대로다.

## G. 품질 게이트

| 검증 | required | 판단 |
| --- | --- | --- |
| `quality` | 예 | architecture, test, lint, type, env, build, bundle을 한 상태로 보고한다. E2E가 생략돼도 job은 항상 존재한다. |
| E2E 개별 상태 | 아니오 | 같은 `quality` 안의 조건부 스텝이다. 실행 대상이면 실패가 job을 막고 문서 PR이면 생략한다. |
| Lighthouse | 아니오 | 7주차 기준은 throttling 5회 중앙값이다. 공유 CI runner 한 번의 점수를 merge blocker로 쓰면 변동성을 결함으로 오인한다. |
| AI 리뷰 | 아니오 | 모델과 프롬프트에 따라 결과가 바뀌므로 advisory로만 쓴다. |

`quality`의 workflow 권한은 `contents: read`뿐이다. PR 코멘트와 secrets를 쓰지 않는다. checkout, setup-node, pnpm setup, artifact 액션은 commit SHA로 고정했다. `pull_request_target`도 사용하지 않는다.

secrets를 쓰는 workflow는 `deployment-smoke` 하나다. `deployment_status`는 `pull_request_target`과 같이 base 저장소 권한과 secrets를 들고 도는 트리거라, 배포 SHA를 checkout하면 fork PR preview의 코드가 bypass secret이 있는 환경에서 실행된다. 실행 코드는 기본 브랜치에서 받고, 대상 URL도 https `*.vercel.app`으로 좁혔다. 근거는 `week10-release-flow.md`에 있다.

## H. 함께 생각해 볼 질문

### E2E를 모든 PR에 required로 걸면 어떤 문제가 생길까?

문서 변경에도 브라우저 설치와 12개 흐름을 실행해 비용이 반복된다. 조건부 job 자체를 required로 두면 실행되지 않은 PR이 대기 상태에 남을 수 있다. 이 저장소는 항상 존재하는 `quality` job 안에서 실행 경로가 바뀐 경우에만 E2E를 실행해 두 문제를 분리했다.

### Lighthouse 점수 하락은 항상 merge blocker여야 할까?

아니다. 네트워크와 CPU throttling에 따른 변동 폭이 코드 변화보다 클 수 있다. 결정적인 bundle byte 예산은 모든 PR을 막고, Lighthouse는 주요 화면 변경에서 5회 중앙값과 범위를 비교하는 판단 자료로 남긴다.

### Preview가 Production API를 바라보면 무슨 일이 생길까?

테스트 주문·이메일·결제가 실제 데이터와 외부 시스템에 들어갈 수 있다. 현재 mock API에는 이 경계가 없지만 실제 API를 붙이면 Preview와 Production의 API origin을 별도 필수 변수로 두고, Preview 값에서 Production host를 거부하는 검증을 추가해야 한다.

### AI가 만든 workflow를 그대로 merge하면 어떤 위험이 있을까?

이번 초안은 176초를 브라우저 다운로드로 잘못 귀속해 효과 없는 캐시를 제안했다. 이후 리뷰에서는 `.env` 미검사, 확장자·동적 import 우회와 경로 필터 누락을 찾았다. AI 출력은 가설과 후보로 받고 실제 diff, 공식 계약, 실패 주입과 Actions 로그로 확인한 뒤 채택한다.

<!-- protection 검증용 문서 변경. 런타임에 닿지 않는다. -->
