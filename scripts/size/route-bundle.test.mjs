import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  evaluateRouteBudgets,
  findUnregisteredRoutes,
} from './route-bundle.mjs'

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
          { route: '/login', firstLoadUncompressedJsBytes: 576_958 },
          { route: '/orders', firstLoadUncompressedJsBytes: 583_526 },
          { route: '/orders/new', firstLoadUncompressedJsBytes: 577_350 },
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

describe('예산 미등록 라우트', () => {
  it('예산표와 제외 목록 어디에도 없는 라우트를 찾는다', () => {
    const unregistered = findUnregisteredRoutes(
      [
        { route: '/', firstLoadUncompressedJsBytes: 1 },
        { route: '/checkout', firstLoadUncompressedJsBytes: 5_000_000 },
      ],
      { '/': 100 },
      {},
    )

    assert.deepEqual(unregistered, ['/checkout'])
  })

  it('제외 목록에 이유와 함께 등록된 라우트는 통과시킨다', () => {
    const unregistered = findUnregisteredRoutes(
      [{ route: '/playground', firstLoadUncompressedJsBytes: 5_000_000 }],
      { '/': 100 },
      { '/playground': '제품 표면이 아니다.' },
    )

    assert.deepEqual(unregistered, [])
  })

  it('CLI는 미등록 라우트를 실패로 보고한다', () => {
    // 라우트를 새로 만드는 것만으로 예산 게이트를 빠져나가는 경로를 막는다.
    const fixtureDir = mkdtempSync(join(tmpdir(), 'week10-size-'))
    const statsPath = join(fixtureDir, 'route-bundle-stats.json')

    try {
      writeFileSync(
        statsPath,
        JSON.stringify([
          { route: '/', firstLoadUncompressedJsBytes: 602_487 },
          { route: '/products', firstLoadUncompressedJsBytes: 619_069 },
          { route: '/login', firstLoadUncompressedJsBytes: 576_958 },
          { route: '/orders', firstLoadUncompressedJsBytes: 583_526 },
          { route: '/orders/new', firstLoadUncompressedJsBytes: 577_350 },
          { route: '/checkout', firstLoadUncompressedJsBytes: 5_000_000 },
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
      assert.match(result.stderr, /예산 미등록 라우트: \/checkout/)
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true })
    }
  })
})
