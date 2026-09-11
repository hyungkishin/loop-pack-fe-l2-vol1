import { readFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const KIB = 1024

// Next 16.2.10이 .next/diagnostics/route-bundle-stats.json에 기록하는
// 라우트별 firstLoadUncompressedJsBytes를 사용한다. Lighthouse의 네트워크
// transferSize와 단위가 다르므로 두 값을 직접 비교하지 않는다.
// 임계값은 모두 같은 정책으로 정한다 — 같은 Next build에서 3회 측정해 편차가 0인
// 현재값에 5%를 더하고 KiB로 올림한다. `/`와 `/products`는 7주차 측정 대상이라
// week10-ci.md E절에 추이가 있고, 나머지 제품 화면은 10주차 현재값이 출발점이다.
export const ROUTE_BUDGETS = {
  '/': 618 * KIB,
  '/products': 635 * KIB,
  '/login': 592 * KIB,
  '/orders': 599 * KIB,
  '/orders/new': 593 * KIB,
}

// 예산을 두지 않기로 한 라우트와 그 이유다. 예산표에 없는 라우트를 조용히 넘기면
// 라우트를 새로 만드는 것만으로 게이트를 빠져나간다. 둘 중 한 곳에 이름이 있어야 통과한다.
export const UNBUDGETED_ROUTES = {
  '/_not-found': 'Next 내부 라우트다. 제품 화면이 아니고 공통 청크만 싣는다.',
  '/playground': '컴포넌트 확인용 실습 화면이다. 제품 표면이 아니다.',
  '/performance-lab/inp':
    '7주차 INP 측정 실습 화면이다. 측정 대상을 일부러 무겁게 두는 자리다.',
}

export const findUnregisteredRoutes = (
  stats,
  budgets = ROUTE_BUDGETS,
  exempt = UNBUDGETED_ROUTES,
) =>
  stats
    .map((entry) => entry.route)
    .filter((route) => !(route in budgets) && !(route in exempt))
    .sort()

const formatKiB = (bytes) => `${(bytes / KIB).toFixed(1)} KiB`

export const evaluateRouteBudgets = (stats, budgets = ROUTE_BUDGETS) => {
  const byRoute = new Map(
    stats.map((entry) => [entry.route, entry.firstLoadUncompressedJsBytes]),
  )

  return Object.entries(budgets).map(([route, budget]) => {
    const actual = byRoute.get(route)
    if (!Number.isFinite(actual)) {
      return { route, budget, actual: null, delta: null, passed: false }
    }

    return {
      route,
      budget,
      actual,
      delta: actual - budget,
      passed: actual <= budget,
    }
  })
}

const renderTable = (results) => {
  const rows = results.map((result) => {
    const actual =
      result.actual === null ? '측정값 없음' : formatKiB(result.actual)
    const delta =
      result.delta === null
        ? '-'
        : `${result.delta > 0 ? '+' : ''}${formatKiB(result.delta)}`
    return `| ${result.route} | ${actual} | ${formatKiB(result.budget)} | ${delta} | ${result.passed ? '통과' : '실패'} |`
  })

  return [
    '| 라우트 | 현재 비압축 JS | 예산 | 차이 | 결과 |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows,
  ].join('\n')
}

const readStats = (statsPath) => {
  const parsed = JSON.parse(readFileSync(statsPath, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new Error(`${statsPath}의 최상위 값이 배열이 아닙니다.`)
  }
  return parsed
}

const run = () => {
  const statsPath =
    process.env.ROUTE_BUNDLE_STATS_PATH ??
    '.next/diagnostics/route-bundle-stats.json'
  const stats = readStats(statsPath)
  const results = evaluateRouteBudgets(stats)
  const unregistered = findUnregisteredRoutes(stats)
  const table = renderTable(results)
  const failed = results.filter((result) => !result.passed)

  const unregisteredReport =
    unregistered.length === 0
      ? ''
      : `\n예산 미등록 라우트: ${unregistered.join(', ')}\n` +
        'ROUTE_BUDGETS에 임계값을 넣거나 UNBUDGETED_ROUTES에 이유와 함께 넣습니다.\n'

  process.stdout.write(`${table}\n${unregisteredReport}`)

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## 라우트 번들 예산\n\n측정 단위: Next 16.2.10의 최초 로드 비압축 JavaScript\n\n${table}\n${unregisteredReport}\n`,
      'utf8',
    )
  }

  if (unregistered.length > 0) {
    process.stderr.write(
      `예산 미등록 라우트: ${unregistered.join(', ')}\n` +
        'ROUTE_BUDGETS에 임계값을 넣거나 UNBUDGETED_ROUTES에 이유와 함께 넣습니다.\n',
    )
    process.exitCode = 1
  }

  if (failed.length > 0) {
    process.stderr.write(
      `번들 예산 초과: ${failed
        .map((result) =>
          result.actual === null
            ? `${result.route} 측정값 없음`
            : `${result.route} ${formatKiB(result.actual)} / 예산 ${formatKiB(result.budget)} (${formatKiB(result.delta)} 초과)`,
        )
        .join(', ')}\n`,
    )
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
}
