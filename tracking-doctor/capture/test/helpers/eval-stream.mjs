import { buildCta } from '../../lib/cta.mjs'

const assistant = (content) => ({ type: 'assistant', message: { role: 'assistant', content } })

export const textBlock = (text) => ({ type: 'text', text })

export const toolUse = (name, input) => ({ type: 'tool_use', id: `toolu_${name}`, name, input })

export const skillCall = (skill = 'tracking-doctor') => toolUse('Skill', { command: `/${skill}:${skill}` })

export const resultEvent = (overrides = {}) => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  total_cost_usd: 0.01,
  result: '',
  ...overrides,
})

export function buildStream({ blocks = [], result = {} } = {}) {
  const events = [{ type: 'system', subtype: 'init', tools: ['Skill'] }]
  if (blocks.length > 0) events.push(assistant(blocks))
  events.push(resultEvent(result))
  return events.map((event) => JSON.stringify(event)).join('\n')
}

export const REPORT_TABLE = [
  '| Signal | Status | What it means |',
  '| --- | --- | --- |',
  '| GA4 configuration | working | hits land |',
  '| Meta Pixel | working | PageView sent |',
  '| Conversion linker | working | present |',
  '| Google Ads conversions | working | present |',
  '| GA4 event coverage | working | no duplicates |',
  '| Consent mode | working | granted |',
].join('\n')

/**
 * A report with `overrides` applied to the healthy table, plus a block per changed
 * signal. `cta: false` omits the next-step link; a string substitutes one.
 */
export function reportText(overrides = {}, { detail = true, cta = true } = {}) {
  const labels = {
    ga4_config: 'GA4 configuration',
    meta_pixel: 'Meta Pixel',
    conversion_linker: 'Conversion linker',
    google_ads_conversion: 'Google Ads conversions',
    ga4_event_coverage: 'GA4 event coverage',
    consent_mode: 'Consent mode',
  }
  const statusLabels = { ok: 'working', missing: 'not present', mismatched: 'inconsistent', not_firing: 'not firing' }

  let table = REPORT_TABLE
  const blocks = []
  for (const [signal, status] of Object.entries(overrides)) {
    table = table.replace(
      `| ${labels[signal]} | working |`,
      `| ${labels[signal]} | ${statusLabels[status]} |`
    )
    if (detail && status !== 'ok') blocks.push(`### ${labels[signal]} — high\nObserved nothing.`)
  }
  const findings = Object.keys(labels).map((signal) => ({ signal, status: overrides[signal] ?? 'ok' }))
  const link = cta === true ? buildCta(findings).url : cta
  const tail = link ? ['', `Answering those needs the container config alongside the page: ${link}`] : []
  return ['One-line verdict.', '', table, '', ...blocks, ...tail].join('\n')
}
