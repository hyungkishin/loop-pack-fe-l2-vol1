import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { evaluateRouteBudgets } from './route-bundle.mjs'

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
})
