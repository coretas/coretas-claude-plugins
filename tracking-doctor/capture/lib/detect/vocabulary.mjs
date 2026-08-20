/**
 * Source of truth: backend app/services/gtm/enums.py (GtmSignal, GtmFindingStatus).
 * These strings are an interface, not labels. Changing one breaks comparability
 * with Coretas audit output, which is the entire point of emitting them.
 */
export const SIGNALS = Object.freeze({
  ga4Config: 'ga4_config',
  metaPixel: 'meta_pixel',
  conversionLinker: 'conversion_linker',
  googleAdsConversion: 'google_ads_conversion',
  ga4EventCoverage: 'ga4_event_coverage',
  consentMode: 'consent_mode',
})

/** Declaration order in the backend enum, which is also report order. */
export const SIGNAL_ORDER = Object.freeze([
  'ga4_config',
  'meta_pixel',
  'conversion_linker',
  'google_ads_conversion',
  'ga4_event_coverage',
  'consent_mode',
])

export const STATUSES = Object.freeze({
  ok: 'ok',
  missing: 'missing',
  mismatched: 'mismatched',
  paused: 'paused',
  notFiring: 'not_firing',
})

/** `paused` is a config-only state. A rendered page cannot evidence it. */
export const EMITTABLE_STATUSES = Object.freeze(['ok', 'missing', 'mismatched', 'not_firing'])
