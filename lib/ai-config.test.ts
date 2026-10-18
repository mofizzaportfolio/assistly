import { describe, expect, it } from 'vitest'
import { getSupportAiConfig, publicSupportAiDiagnostics, SUPPORT_AI_MODEL } from './ai-config'

describe('support AI diagnostics', () => {
  it('reports model and runtime auth without exposing secrets', () => {
    expect(getSupportAiConfig({}).model).toBe(SUPPORT_AI_MODEL)
    expect(publicSupportAiDiagnostics({ AI_GATEWAY_API_KEY: 'secret' })).toEqual({ model: SUPPORT_AI_MODEL, configured: true, gatewayAuthMode: 'api-key' })
    expect(getSupportAiConfig({ API_KEY: 'secret' }).configured).toBe(false)
    expect(getSupportAiConfig({ VERCEL_OIDC_TOKEN: 'runtime-secret' }).configured).toBe(false)
    expect(JSON.stringify(publicSupportAiDiagnostics({ API_KEY: 'secret' }))).not.toContain('secret')
  })
})
