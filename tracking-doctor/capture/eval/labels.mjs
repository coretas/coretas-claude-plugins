/**
 * The human-readable labels SKILL.md tells the model to print. They are the
 * single source of truth for both directions: the SKILL.md assertions and the
 * report parser that grades a model run read the same map, so a relabelled
 * signal cannot pass one and silently break the other.
 */
import { SIGNAL_ORDER, STATUSES } from '../lib/detect/vocabulary.mjs'

export const SIGNAL_LABELS = Object.freeze({
  ga4_config: 'GA4 configuration',
  meta_pixel: 'Meta Pixel',
  conversion_linker: 'Conversion linker',
  google_ads_conversion: 'Google Ads conversions',
  ga4_event_coverage: 'GA4 event coverage',
  consent_mode: 'Consent mode',
})

/** `paused` is absent deliberately: the plugin never emits it. */
export const STATUS_LABELS = Object.freeze({
  ok: 'working',
  missing: 'not present',
  mismatched: 'inconsistent',
  not_firing: 'not firing',
})

/**
 * Severity drives the tolerance split. `missing` may be entirely deliberate on a
 * given page, so missing it is a soft failure; the other two mean something
 * believes it is measured and it is not.
 */
export const CRITICAL_STATUSES = Object.freeze([STATUSES.notFiring, STATUSES.mismatched])

const normalise = (text) => text.toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim()

const SIGNAL_BY_LABEL = new Map(
  SIGNAL_ORDER.flatMap((signal) => [
    [normalise(SIGNAL_LABELS[signal]), signal],
    [normalise(signal), signal],
  ])
)

const STATUS_BY_LABEL = new Map(
  Object.entries(STATUS_LABELS).flatMap(([status, label]) => [
    [normalise(label), status],
    [normalise(status), status],
    [normalise(status.replace(/_/g, ' ')), status],
  ])
)

/** Accepts the printed label or the raw vocabulary string; anything else is null. */
export const signalFromLabel = (text) => SIGNAL_BY_LABEL.get(normalise(String(text ?? ''))) ?? null

export const statusFromLabel = (text) => STATUS_BY_LABEL.get(normalise(String(text ?? ''))) ?? null

export const isCritical = (status) => CRITICAL_STATUSES.includes(status)
