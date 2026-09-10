import { readFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const KIB = 1024

// Next 16.2.10이 .next/diagnostics/route-bundle-stats.json에 기록하는
// 라우트별 firstLoadUncompressedJsBytes를 사용한다. Lighthouse의 네트워크
// transferSize와 단위가 다르므로 두 값을 직접 비교하지 않는다.
export const ROUTE_BUDGETS = {
  '/': 618 * KIB,
  '/products': 635 * KIB,
}

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
  const results = evaluateRouteBudgets(readStats(statsPath))
  const table = renderTable(results)
  const failed = results.filter((result) => !result.passed)

  process.stdout.write(`${table}\n`)

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## 라우트 번들 예산\n\n측정 단위: Next 16.2.10의 최초 로드 비압축 JavaScript\n\n${table}\n\n`,
      'utf8',
    )
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
