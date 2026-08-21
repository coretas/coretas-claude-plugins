import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence } from '../../lib/detect/evidence.mjs'
import { detectGa4Config } from '../../lib/detect/signals/ga4-config.mjs'
import { STATUSES } from '../../lib/detect/vocabulary.mjs'
import { ga4Hit, loader, makeCapture } from '../helpers/captures.mjs'

const detect = (capture) => detectGa4Config(collectEvidence(capture))

test('loader present, zero hits, is not_firing — not ok (CRM-1421)', () => {
  const capture = makeCapture({ requests: [loader({ id: 'G-ABC123' })] })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.notFiring)
  assert.notEqual(finding.status, STATUSES.ok)
})

test('no loader, no hit, no dataLayer config -> missing', () => {
  const finding = detect(makeCapture())
  assert.equal(finding.status, STATUSES.missing)
})

test('declared id with zero successful hits -> not_firing', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'G-ABC123' }), ga4Hit({ tid: 'G-ABC123', en: 'page_view', failure: 'net::ERR_FAILED' })],
  })
  assert.equal(detect(capture).status, STATUSES.notFiring)
})

test('two distinct observed measurement ids -> mismatched', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1000 }),
      ga4Hit({ tid: 'G-XYZ789', en: 'page_view', tMs: 1100 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
})

test('observed id not in the declared set -> mismatched', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'G-ABC123' }), ga4Hit({ tid: 'G-DIFFERENT', en: 'page_view' })],
  })
  assert.equal(detect(capture).status, STATUSES.mismatched)
})

test('declared id never observed as a tid -> mismatched', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'G-ABC123' }), ga4Hit({ tid: 'G-DIFFERENT', en: 'page_view' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.match(finding.detail, /do not match the configured ID/)
})

test('exactly one measurement id, declared and observed -> ok', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'G-ABC123' }), ga4Hit({ tid: 'G-ABC123', en: 'page_view' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.equal(finding.observed_values.hit_count, 1)
})

test('a GTM container with no declared measurement id is ok when hits are consistent', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'GTM-ABC123' }), ga4Hit({ tid: 'G-ABC123', en: 'page_view' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.deepEqual(finding.observed_values.measurement_ids_declared, [])
})

test('a blocked hit counts as not fired, not as evidence of firing', () => {
  const capture = makeCapture({
    requests: [
      loader({ id: 'G-ABC123' }),
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', failure: 'net::ERR_BLOCKED_BY_CLIENT' }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.notFiring)
  assert.equal(finding.observed_values.failed_hit_count, 1)
  assert.equal(finding.observed_values.hit_count, 0)
})

test('a blocked hit with no declared id anywhere is missing, not a bogus ok', () => {
  const capture = makeCapture({
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', failure: 'net::ERR_BLOCKED_BY_CLIENT' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.missing)
  assert.ok(!finding.detail.includes('undefined'))
})

test('tag_names is always an empty array', () => {
  assert.deepEqual(detect(makeCapture()).tag_names, [])
})
