import { describe, expect, it } from 'vitest'
import { getApprovedTestDatabaseUrl } from './test-database'

describe('test database guard', () => {
  it('requires explicit opt-in and rejects production URL reuse', () => {
    expect(() => getApprovedTestDatabaseUrl({ DATABASE_URL: 'postgres://x@y/db', TEST_DATABASE_URL: 'postgres://x@y/db', ALLOW_TEST_DATABASE: 'true' })).toThrow(/must not equal/)
    expect(() => getApprovedTestDatabaseUrl({ TEST_DATABASE_URL: 'postgres://x@y/test' })).toThrow(/ALLOW_TEST_DATABASE/)
  })
  it('accepts an explicitly approved isolated URL', () => {
    expect(getApprovedTestDatabaseUrl({ TEST_DATABASE_URL: 'postgres://x@y/assistly_test', ALLOW_TEST_DATABASE: 'true' })).toContain('/assistly_test')
  })
})
