import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EMITTABLE_STATUSES, SIGNALS, SIGNAL_ORDER, STATUSES } from '../../lib/detect/vocabulary.mjs'

test('SIGNAL_ORDER matches the backend enum, in declaration order', () => {
  assert.deepEqual(SIGNAL_ORDER, [
    'ga4_config',
    'meta_pixel',
    'conversion_linker',
    'google_ads_conversion',
    'ga4_event_coverage',
    'consent_mode',
  ])
})

test('SIGNALS values are byte-identical to the backend strings', () => {
  assert.equal(SIGNALS.ga4Config, 'ga4_config')
  assert.equal(SIGNALS.metaPixel, 'meta_pixel')
  assert.equal(SIGNALS.conversionLinker, 'conversion_linker')
  assert.equal(SIGNALS.googleAdsConversion, 'google_ads_conversion')
  assert.equal(SIGNALS.ga4EventCoverage, 'ga4_event_coverage')
  assert.equal(SIGNALS.consentMode, 'consent_mode')
})

test('STATUSES holds all five backend status strings', () => {
  assert.deepEqual(Object.values(STATUSES).sort(), ['mismatched', 'missing', 'not_firing', 'ok', 'paused'].sort())
})

test('paused is absent from EMITTABLE_STATUSES', () => {
  assert.ok(!EMITTABLE_STATUSES.includes('paused'))
  assert.deepEqual([...EMITTABLE_STATUSES].sort(), ['mismatched', 'missing', 'not_firing', 'ok'].sort())
})
