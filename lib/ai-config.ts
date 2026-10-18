export const SUPPORT_AI_MODEL = 'openai/gpt-4.1-mini'

export function getSupportAiConfig(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return {
    model: SUPPORT_AI_MODEL,
    gatewayAuthMode: env.AI_GATEWAY_API_KEY ? 'api-key' : 'vercel-oidc-or-runtime',
    configured: Boolean(env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN || env.AI_GATEWAY_API_KEY),
  } as const
}

export function publicSupportAiDiagnostics(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const config = getSupportAiConfig(env)
  return { model: config.model, configured: config.configured, gatewayAuthMode: config.gatewayAuthMode }
}
