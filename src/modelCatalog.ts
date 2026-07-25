import type { ModelDefinition, ProviderId } from './types'

export type ProviderDefinition = {
  id: ProviderId
  name: string
  description: string
  note?: string
}

export const PROVIDERS: ProviderDefinition[] = [
  { id: 'codex', name: 'OpenAI · Codex', description: 'OpenAI models available in the Codex app and CLI.' },
  { id: 'github-copilot', name: 'GitHub Copilot', description: 'Models selectable through a Copilot subscription.', note: 'Availability depends on plan, client and organization policy.' },
  { id: 'claude-code', name: 'Claude Code', description: 'Claude models used with Anthropic Pro, Max, Team or Enterprise.' },
  { id: 'opencode', name: 'OpenCode', description: 'OpenCode Zen, Go, connected providers and local models.', note: 'OpenCode supports many changing providers; add any missing model below.' },
  { id: 'kimi-code', name: 'Kimi Code', description: 'Kimi coding models included with Kimi Code memberships.' },
  { id: 'cursor', name: 'Cursor', description: 'Cursor Auto routing and models included with your plan.', note: 'The exact catalogue changes by plan and region.' },
  { id: 'gemini-code-assist', name: 'Gemini Code Assist', description: 'Google coding models for Standard and Enterprise plans.' },
]

const model = (provider: ProviderId, id: string, description: string, enabled = false): ModelDefinition => ({
  id: `${provider}/${id}`,
  provider,
  enabled,
  description,
})

export const MODEL_CATALOG: ModelDefinition[] = [
  model('codex', 'gpt-5.6-sol', 'Latest frontier agentic coding model', true),
  model('codex', 'gpt-5.6-terra', 'Balanced agentic coding model'),
  model('codex', 'gpt-5.6-luna', 'Fast agentic coding model'),
  model('codex', 'gpt-5.5', 'Complex coding and real-world work'),
  model('codex', 'gpt-5.4', 'Everyday coding'),
  model('codex', 'gpt-5.4-mini', 'Small, fast and cost-efficient'),
  model('codex', 'gpt-5.3-codex-spark', 'Ultra-fast coding model'),

  ...['gpt-5-mini', 'gpt-5.3-codex', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'claude-fable-5', 'claude-haiku-4.5', 'claude-opus-4.5', 'claude-opus-4.6', 'claude-opus-4.7', 'claude-opus-4.8', 'claude-opus-4.8-fast', 'claude-sonnet-4.5', 'claude-sonnet-4.6', 'claude-sonnet-5', 'gemini-2.5-pro', 'gemini-3-flash', 'gemini-3.1-pro', 'gemini-3.5-flash', 'mai-code-1-flash', 'raptor-mini', 'kimi-k2.7-code']
    .map((id) => model('github-copilot', id, 'Available through GitHub Copilot')),

  model('claude-code', 'claude-fable-5', 'Highest Claude capability'),
  model('claude-code', 'claude-opus-4.8', 'Complex agentic coding'),
  model('claude-code', 'claude-sonnet-5', 'Balanced frontier Claude model'),
  model('claude-code', 'claude-sonnet-4.6', 'Fast, balanced Claude model'),
  model('claude-code', 'claude-haiku-4.5', 'Fast Claude model'),

  model('opencode', 'gpt-5.3-codex-spark', 'OpenCode model route'),
  model('opencode', 'gemini-3.6-flash', 'OpenCode model route'),

  model('kimi-code', 'k3', 'Kimi K3 · up to 1M context · low/high/max reasoning'),
  model('kimi-code', 'k3-256k', 'Kimi K3 · 256k context · lower quota consumption'),
  model('kimi-code', 'kimi-for-coding', 'Kimi K2.7 Code · 256k context'),
  model('kimi-code', 'kimi-for-coding-highspeed', 'Kimi K2.7 Code · 256k · 5–6× faster output'),

  model('cursor', 'auto', 'Let Cursor choose the best model'),
  model('gemini-code-assist', 'gemini-3.1-pro', 'Complex coding tasks'),
  model('gemini-code-assist', 'gemini-3.5-flash', 'Fast coding assistance'),
]

export const MODEL_IDS = MODEL_CATALOG.map((item) => item.id)
export const providerFor = (id?: ProviderId) => PROVIDERS.find((provider) => provider.id === id)
export const providerName = (id?: ProviderId) => providerFor(id)?.name ?? id ?? 'Custom provider'
export const inferredProvider = (model: Pick<ModelDefinition, 'id' | 'provider'>): ProviderId => {
  const legacyProvider = !model.provider || model.provider === 'custom'
  if ((legacyProvider || model.provider === 'openai') && /^(?:codex\/)?(?:gpt-|o\d)/i.test(model.id)) return 'codex'
  if ((legacyProvider || model.provider === 'anthropic') && /^(?:claude-code\/)?claude-/i.test(model.id)) return 'claude-code'
  if ((legacyProvider || model.provider === 'kimi') && /^(?:kimi-code\/)?(?:kimi-|k\d)/i.test(model.id)) return 'kimi-code'
  return model.provider ?? 'custom'
}
export const modelsForProviders = (providers: ProviderId[]) =>
  MODEL_CATALOG.filter((item) => providers.includes(item.provider!)).map((item) => ({ ...item, enabled: true }))
