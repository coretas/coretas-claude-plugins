import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence, firstValue } from '../../lib/detect/evidence.mjs'
import { ga4Hit, loader, makeCapture, metaHit } from '../helpers/captures.mjs'

test('firstValue reads the first element of a repeated-key array, and the scalar otherwise', () => {
  assert.equal(firstValue({ a: ['1', '2'] }, 'a'), '1')
  assert.equal(firstValue({ a: '1' }, 'a'), '1')
  assert.equal(firstValue({}, 'a'), undefined)
})

test('a POST query-rows batch yields one GA4 event per row', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({
        tid: 'G-ABC123',
        rows: [
          { en: 'page_view' },
          { en: 'scroll', 'epn.percent': '90' },
          { en: 'click' },
        ],
      }),
    ],
  })
  const evidence = collectEvidence(capture)
  assert.equal(evidence.ga4.events.length, 3)
  assert.deepEqual(
    evidence.ga4.events.map((event) => event.name),
    ['page_view', 'scroll', 'click']
  )
})

test('a Meta pixel hit sent as a POST with a query-string body is still read', () => {
  const capture = makeCapture({
    requests: [
      {
        tMs: 1000,
        phase: 'post-consent',
        route: null,
        method: 'POST',
        resourceType: 'fetch',
        host: 'www.facebook.com',
        path: '/tr/',
        url: 'https://www.facebook.com/tr/',
        params: {},
        body: { kind: 'query', params: { id: '111222333', ev: 'PageView' } },
        status: 200,
        failure: null,
        frameUrl: 'https://example.test/',
      },
    ],
  })
  const evidence = collectEvidence(capture)
  assert.deepEqual(evidence.meta.pixelIds, ['111222333'])
  assert.deepEqual(evidence.meta.events, ['PageView'])
})

test('an array-valued param is read through firstValue, not passed through raw', () => {
  const capture = makeCapture({
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', extraParams: { 'up.plan': ['pro', 'trial'] } })],
  })
  const evidence = collectEvidence(capture)
  assert.equal(evidence.ga4.observedIds[0], 'G-ABC123')
})

test('a failed request is recorded as a hit but excluded from every fired count', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', failure: 'net::ERR_BLOCKED_BY_CLIENT' }),
      metaHit({ id: '1112223334445', ev: 'PageView', failure: 'net::ERR_BLOCKED_BY_CLIENT' }),
    ],
  })
  const evidence = collectEvidence(capture)
  assert.equal(evidence.ga4.hits.length, 1)
  assert.equal(evidence.ga4.hits[0].failure, 'net::ERR_BLOCKED_BY_CLIENT')
  assert.equal(evidence.ga4.observedIds.length, 0)
  assert.equal(evidence.ga4.events.length, 0)
  assert.equal(evidence.meta.hits.length, 1)
  assert.equal(evidence.meta.pixelIds.length, 0)
  assert.equal(evidence.meta.events.length, 0)
})

test('string arrays in the evidence are deduplicated and sorted', () => {
  const capture = makeCapture({
    requests: [
      loader({ id: 'G-ZZZ999', tMs: 100 }),
      loader({ id: 'G-AAA111', tMs: 200 }),
      loader({ id: 'G-AAA111', tMs: 300 }),
      ga4Hit({ tid: 'G-AAA111', en: 'page_view', tMs: 1000 }),
    ],
  })
  const evidence = collectEvidence(capture)
  assert.deepEqual(evidence.ga4.declaredIds, ['G-AAA111', 'G-ZZZ999'])
})

test('hit and event arrays keep observation order rather than being sorted', () => {
  const capture = makeCapture({
    requests: [
      ga4Hit({ tid: 'G-ABC123', en: 'click', tMs: 2000 }),
      ga4Hit({ tid: 'G-ABC123', en: 'page_view', tMs: 1000 }),
    ],
  })
  const evidence = collectEvidence(capture)
  assert.deepEqual(
    evidence.ga4.events.map((event) => event.name),
    ['click', 'page_view']
  )
})
