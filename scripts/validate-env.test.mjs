import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  findPublicSecretNames,
  validateAppOrigin,
  validateEnvironment,
} from './validate-env.mjs'

describe('환경 변수 검증', () => {
  it('APP_ORIGIN이 없으면 실패한다', () => {
    assert.match(validateAppOrigin(undefined), /없습니다/)
  })

  it('상대 URL이면 실패한다', () => {
    assert.match(validateAppOrigin('127.0.0.1:3000'), /절대 URL/)
  })

  it('http(s)가 아닌 URL이면 실패한다', () => {
    assert.match(validateAppOrigin('ftp://example.com'), /http 또는 https/)
  })

  it('절대 http(s) URL이면 통과한다', () => {
    assert.equal(validateAppOrigin('http://127.0.0.1:3000'), null)
    assert.equal(validateAppOrigin('https://preview.example.com/path'), null)
  })

  it('공개 변수 이름에서 비밀정보 징후를 찾고 값은 반환하지 않는다', () => {
    const names = findPublicSecretNames({
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
      NEXT_PUBLIC_AUTH_TOKEN: 'do-not-print-this',
      NEXT_PUBLIC_PRIVATE_KEY: 'do-not-print-this-either',
    })

    assert.deepEqual(names, [
      'NEXT_PUBLIC_AUTH_TOKEN',
      'NEXT_PUBLIC_PRIVATE_KEY',
    ])
    assert.doesNotMatch(names.join(' '), /do-not-print/)
  })

  it('모든 오류를 한 번에 보고한다', () => {
    const errors = validateEnvironment({
      APP_ORIGIN: '',
      NEXT_PUBLIC_PASSWORD: 'do-not-print-this',
    })

    assert.equal(errors.length, 2)
    assert.doesNotMatch(errors.join(' '), /do-not-print/)
  })
})
