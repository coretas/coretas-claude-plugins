import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence } from '../../lib/detect/evidence.mjs'
import { detectGa4EventCoverage } from '../../lib/detect/signals/ga4-event-coverage.mjs'
import { STATUSES } from '../../lib/detect/vocabulary.mjs'
import { ga4Hit, makeCapture } from '../helpers/captures.mjs'

const detect = (capture) => detectGa4EventCoverage(collectEvidence(capture))

test('no GA4 hits at all -> missing', () => {
  assert.equal(detect(makeCapture()).status, STATUSES.missing)
})

test('hits exist but none is a page_view -> not_firing', () => {
  const capture = makeCapture({ requests: [ga4Hit({ tid: 'G-ABC123', en: 'scroll' })] })
  assert.equal(detect(capture).status, STATUSES.notFiring)
})

test('a duplicate page_view within one second -> mismatched', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1000 }),
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1500 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.match(finding.detail, /page_view was sent 2 times/)
})

test('duplicate window boundary: exactly 1000ms apart still counts as a duplicate', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1000 }),
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 2000 }),
      ga4Hit({ tid: 'G-ABC123', en: 'sign_up', tMs: 5000 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.match(finding.detail, /page_view was sent 2 times/)
})

test('duplicate window boundary: 1001ms apart is not a duplicate', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1000 }),
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 2001 }),
      ga4Hit({ tid: 'G-ABC123', en: 'sign_up', tMs: 5000 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.equal(finding.observed_values.duplicates.length, 0)
})

test('only automatic events observed -> mismatched', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1000 }),
      ga4Hit({ tid: 'G-ABC123', en: 'scroll', tMs: 5000 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.match(finding.detail, /automatic events/)
})

test('page_view plus a custom event -> ok', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1000 }),
      ga4Hit({ tid: 'G-ABC123', en: 'sign_up', tMs: 5000 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.deepEqual(finding.observed_values.custom_events, ['sign_up'])
})

test('events sourced from a single POST batch cover page_view and a custom event', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({
        tid: 'G-ABC123',
        tMs: 1000,
        rows: [{ en: 'page_view' }, { en: 'purchase', value: '9.99' }],
      }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.deepEqual(finding.observed_values.custom_events, ['purchase'])
})

test('tag_names is always an empty array', () => {
  assert.deepEqual(detect(makeCapture()).tag_names, [])
})
