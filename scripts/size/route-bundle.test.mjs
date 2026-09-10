import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { evaluateRouteBudgets } from './route-bundle.mjs'

const checkerPath = fileURLToPath(
  new URL('./route-bundle.mjs', import.meta.url),
)

describe('라우트 번들 예산', () => {
  it('예산 이하인 라우트를 통과시킨다', () => {
    const [result] = evaluateRouteBudgets(
      [{ route: '/', firstLoadUncompressedJsBytes: 99 }],
      { '/': 100 },
    )

    assert.deepEqual(result, {
      route: '/',
      budget: 100,
      actual: 99,
      delta: -1,
      passed: true,
    })
  })

  it('예산을 넘긴 라우트와 초과량을 반환한다', () => {
    const [result] = evaluateRouteBudgets(
      [{ route: '/products', firstLoadUncompressedJsBytes: 125 }],
      { '/products': 100 },
    )

    assert.equal(result.passed, false)
    assert.equal(result.delta, 25)
  })

  it('필수 라우트 측정값이 없으면 실패한다', () => {
    const [result] = evaluateRouteBudgets([], { '/': 100 })

    assert.deepEqual(result, {
      route: '/',
      budget: 100,
      actual: null,
      delta: null,
      passed: false,
    })
  })

  it('CLI는 예산 초과량을 출력하고 종료 코드 1을 반환한다', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'week10-size-'))
    const statsPath = join(fixtureDir, 'route-bundle-stats.json')

    try {
      writeFileSync(
        statsPath,
        JSON.stringify([
          { route: '/', firstLoadUncompressedJsBytes: 700_000 },
          { route: '/products', firstLoadUncompressedJsBytes: 619_069 },
        ]),
        'utf8',
      )

      const result = spawnSync(process.execPath, [checkerPath], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: '',
          ROUTE_BUNDLE_STATS_PATH: statsPath,
        },
      })

      assert.equal(result.status, 1)
      assert.match(result.stderr, /\/ 683\.6 KiB/)
      assert.match(result.stderr, /65\.6 KiB 초과/)
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
