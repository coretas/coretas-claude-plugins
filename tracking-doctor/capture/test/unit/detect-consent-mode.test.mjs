import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence } from '../../lib/detect/evidence.mjs'
import { detectConsentMode } from '../../lib/detect/signals/consent-mode.mjs'
import { STATUSES } from '../../lib/detect/vocabulary.mjs'
import { ga4Hit, gtagCommand, makeCapture } from '../helpers/captures.mjs'

const detect = (capture) => detectConsentMode(collectEvidence(capture), capture)

test('no gcs, no gcd, no consent command -> missing', () => {
  assert.equal(detect(makeCapture()).status, STATUSES.missing)
})

test('a consent command exists but no hit carries a consent state -> not_firing', () => {
  const capture = makeCapture({
    dataLayer: [gtagCommand({ command: 'consent', args: ['default', { ad_storage: 'denied', analytics_storage: 'denied' }] })],
  })
  assert.equal(detect(capture).status, STATUSES.notFiring)
})

test('default denies a storage type, banner accepted, no update -> mismatched', () => {
  const capture = makeCapture({
    dataLayer: [gtagCommand({ command: 'consent', args: ['default', { ad_storage: 'denied', analytics_storage: 'denied' }] })],
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', extraParams: { gcs: 'G100' } })],
    consent: { action: 'accept', matched: 'selector=#accept', attempted: true, tMs: 500 },
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.match(finding.detail, /accepted but hits still report/)
})

test('default denies a storage type, but an update still shows it denied -> mismatched', () => {
  const capture = makeCapture({
    dataLayer: [
      gtagCommand({ command: 'consent', args: ['default', { ad_storage: 'denied', analytics_storage: 'denied' }], index: 0 }),
      gtagCommand({ command: 'consent', args: ['update', { ad_storage: 'denied' }], index: 1, phase: 'post-consent', tMs: 800 }),
    ],
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', extraParams: { gcs: 'G100' }, phase: 'post-consent', tMs: 900 })],
    consent: { action: 'accept', matched: 'selector=#accept', attempted: true, tMs: 500 },
  })
  assert.equal(detect(capture).status, STATUSES.mismatched)
})

test('no-banner (nothing to accept) does not trigger mismatched even with a denying default', () => {
  const capture = makeCapture({
    dataLayer: [gtagCommand({ command: 'consent', args: ['default', { ad_storage: 'denied', analytics_storage: 'denied' }] })],
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', extraParams: { gcs: 'G100' } })],
    consent: { action: 'accept', matched: null, attempted: true, tMs: 500 },
  })
  const finding = detect(capture)
  assert.notEqual(finding.status, STATUSES.mismatched)
})

test('gcd is recorded verbatim, never decoded', () => {
  const capture = makeCapture({
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', extraParams: { gcs: 'G111', gcd: '13l3l3l313l1l1' } })],
  })
  const finding = detect(capture)
  assert.deepEqual(finding.observed_values.gcd_values, ['13l3l3l313l1l1'])
})

test('consent granted after an accepted default -> ok', () => {
  const capture = makeCapture({
    dataLayer: [
      gtagCommand({ command: 'consent', args: ['default', { ad_storage: 'denied', analytics_storage: 'denied' }], index: 0 }),
      gtagCommand({ command: 'consent', args: ['update', { ad_storage: 'granted', analytics_storage: 'granted' }], index: 1, phase: 'post-consent', tMs: 800 }),
    ],
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', extraParams: { gcs: 'G111' }, phase: 'post-consent', tMs: 900 })],
    consent: { action: 'accept', matched: 'selector=#accept', attempted: true, tMs: 500 },
  })
  assert.equal(detect(capture).status, STATUSES.ok)
})

test('tag_names is always an empty array', () => {
  assert.deepEqual(detect(makeCapture()).tag_names, [])
})
