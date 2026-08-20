import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ID_PATTERNS,
  adsIdMatchesDigits,
  isGa4Hit,
  isGa4Loader,
  isGoogleTagManagerLoader,
  isMetaHit,
  isMetaLoader,
  isUniversalAnalyticsHit,
  matchGoogleAdsHit,
  parseGcs,
} from '../../lib/detect/endpoints.mjs'

test('ID_PATTERNS accept real IDs', () => {
  assert.ok(ID_PATTERNS.ga4Measurement.test('G-ABC123'))
  assert.ok(ID_PATTERNS.gtmContainer.test('GTM-ABC123'))
  assert.ok(ID_PATTERNS.adsConversion.test('AW-123456789'))
  assert.ok(ID_PATTERNS.metaPixel.test('1112223334445'))
})

test('ID_PATTERNS reject near-misses', () => {
  assert.ok(!ID_PATTERNS.ga4Measurement.test('GA-ABC123'))
  assert.ok(!ID_PATTERNS.ga4Measurement.test('G-ab'))
  assert.ok(!ID_PATTERNS.gtmContainer.test('GTM123'))
  assert.ok(!ID_PATTERNS.adsConversion.test('AW-123'))
  assert.ok(!ID_PATTERNS.adsConversion.test('123456789'))
  assert.ok(!ID_PATTERNS.metaPixel.test('123'))
})

test('/g/collect matches on a first-party host', () => {
  assert.ok(isGa4Hit({ host: 'analytics.example.com', path: '/g/collect' }))
})

test('/collect (Universal Analytics) does not match GA4, and is recognised separately', () => {
  assert.ok(!isGa4Hit({ host: 'www.google-analytics.com', path: '/collect' }))
  assert.ok(isUniversalAnalyticsHit({ host: 'www.google-analytics.com', path: '/collect' }))
})

test('GA4 and GTM loader paths are recognised on googletagmanager.com', () => {
  assert.ok(isGa4Loader({ host: 'www.googletagmanager.com', path: '/gtag/js' }))
  assert.ok(isGa4Loader({ host: 'www.googletagmanager.com', path: '/gtm.js' }))
  assert.ok(isGa4Loader({ host: 'www.googletagmanager.com', path: '/gtag/destination' }))
  assert.ok(!isGa4Loader({ host: 'www.example.com', path: '/gtag/js' }))
  assert.ok(isGoogleTagManagerLoader({ host: 'www.googletagmanager.com', path: '/anything' }))
})

test('Meta loader and hit host/path rows', () => {
  assert.ok(isMetaLoader({ host: 'connect.facebook.net', path: '/en_US/fbevents.js' }))
  assert.ok(!isMetaLoader({ host: 'connect.facebook.net', path: '/tr' }))
  for (const host of ['www.facebook.com', 'web.facebook.com', 'connect.facebook.net']) {
    assert.ok(isMetaHit({ host, path: '/tr' }))
    assert.ok(isMetaHit({ host, path: '/tr/' }))
  }
  assert.ok(!isMetaHit({ host: 'www.example.com', path: '/tr' }))
})

test('each Google Ads host/path row is matched with the right kind', () => {
  assert.deepEqual(matchGoogleAdsHit({ host: 'googleads.g.doubleclick.net', path: '/pagead/viewthroughconversion/123456789', params: {} }), {
    kind: 'remarketing',
    id: '123456789',
  })
  assert.deepEqual(
    matchGoogleAdsHit({
      host: 'googleads.g.doubleclick.net',
      path: '/pagead/viewthroughconversion/123456789',
      params: { label: 'abc' },
    }),
    { kind: 'conversion', id: '123456789' }
  )
  assert.deepEqual(matchGoogleAdsHit({ host: 'googleads.g.doubleclick.net', path: '/pagead/1p-conversion/123456789', params: {} }), {
    kind: 'conversion',
    id: '123456789',
  })
  assert.deepEqual(matchGoogleAdsHit({ host: 'www.googleadservices.com', path: '/pagead/conversion/123456789/', params: {} }), {
    kind: 'conversion',
    id: '123456789',
  })
  assert.deepEqual(matchGoogleAdsHit({ host: 'www.google.com', path: '/pagead/conversion/123456789/', params: {} }), {
    kind: 'conversion',
    id: '123456789',
  })
  assert.deepEqual(matchGoogleAdsHit({ host: 'www.google.com', path: '/pagead/1p-conversion/123456789/', params: {} }), {
    kind: 'conversion',
    id: '123456789',
  })
  assert.deepEqual(matchGoogleAdsHit({ host: 'td.doubleclick.net', path: '/td/ga/rul', params: {} }), {
    kind: 'tagging',
    id: null,
  })
  assert.equal(matchGoogleAdsHit({ host: 'www.example.com', path: '/pagead/conversion/123456789/', params: {} }), null)
})

test('adsIdMatchesDigits compares only the digits, exactly', () => {
  assert.ok(adsIdMatchesDigits('AW-123456789', '123456789'))
  assert.ok(!adsIdMatchesDigits('AW-123456789', '99123456789'))
  assert.ok(!adsIdMatchesDigits('AW-123456789', '12345678'))
})

test('gcs parsing, including "not set" dashes', () => {
  assert.deepEqual(parseGcs('G111'), { adStorage: 'granted', analyticsStorage: 'granted' })
  assert.deepEqual(parseGcs('G100'), { adStorage: 'denied', analyticsStorage: 'denied' })
  assert.deepEqual(parseGcs('G1--'), { adStorage: 'unset', analyticsStorage: 'unset' })
  assert.equal(parseGcs('bogus'), null)
  assert.equal(parseGcs(undefined), null)
})
