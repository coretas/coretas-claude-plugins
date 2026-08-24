/**
 * Builds the single outbound link the report prints. Deliberately code, not a
 * template the model fills: README promises the query string carries nothing but
 * vocabulary tokens, and a promise only holds if a test can check it.
 */
import { EMITTABLE_STATUSES, SIGNAL_ORDER, STATUS_SEVERITY, STATUSES } from './detect/vocabulary.mjs'

export const LANDING_URL = 'https://coretas.ai/tracking-doctor/'

/** The cron filters on this campaign, so renaming it silently ends measurement. */
export const CAMPAIGN = 'tracking-doctor-report'

export const CLEAN_CONTENT = 'clean'

export function worstFinding(findings) {
  const ranked = (Array.isArray(findings) ? findings : [])
    .filter((finding) => finding?.status !== STATUSES.ok)
    .map((finding) => ({ finding, rank: rankOf(finding) }))
    .sort((a, b) => a.rank - b.rank)
  return ranked.length === 0 ? null : ranked[0].finding
}

/** `<signal>-<status>`: neither vocabulary contains a hyphen, so this stays splittable. */
export function ctaContent(findings) {
  const worst = worstFinding(findings)
  if (!worst) return CLEAN_CONTENT
  return `${assertToken(worst.signal, SIGNAL_ORDER, 'signal')}-${assertToken(worst.status, EMITTABLE_STATUSES, 'status')}`
}

export function buildCta(findings) {
  const params = new URLSearchParams([
    ['utm_source', 'tracking-doctor'],
    ['utm_medium', 'plugin'],
    ['utm_campaign', CAMPAIGN],
    ['utm_content', ctaContent(findings)],
  ])
  return { url: `${LANDING_URL}?${params}` }
}

function rankOf(finding) {
  const severity = STATUS_SEVERITY.indexOf(finding?.status)
  const order = SIGNAL_ORDER.indexOf(finding?.signal)
  // Severity first, declaration order to break a tie. Unknown values sort last
  // and are rejected by assertToken rather than reaching the query string.
  return (severity === -1 ? STATUS_SEVERITY.length : severity) * 100 + (order === -1 ? SIGNAL_ORDER.length : order)
}

/**
 * The whole privacy argument: anything not already in the vocabulary is a defect,
 * not a value to encode. Throwing is safe because `detect()` validates first.
 */
function assertToken(value, allowed, kind) {
  if (!allowed.includes(value)) {
    throw new Error(`Refusing to build a link from an unknown ${kind}: ${JSON.stringify(value)}`)
  }
  return value
}
