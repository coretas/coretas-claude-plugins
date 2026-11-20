import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence } from '../../lib/detect/evidence.mjs'
import { detectTikTokPixel } from '../../lib/detect/signals/tiktok-pixel.mjs'
import { SIGNALS, STATUSES } from '../../lib/detect/vocabulary.mjs'
import { makeCapture, metaHit, tiktokHit, tiktokLoader } from '../helpers/captures.mjs'

const CODE = 'C8PM4U59481U83L7JFP0'
const detect = (capture) => detectTikTokPixel(collectEvidence(capture))

test('no loader and no hit -> missing', () => {
  const finding = detect(makeCapture())
  assert.equal(finding.signal, SIGNALS.tiktokPixel)
  assert.equal(finding.status, STATUSES.missing)
  assert.equal(finding.detail, 'No TikTok Pixel observed on this page.')
})

test('a Meta pixel alone does not count as TikTok', () => {
  const capture = makeCapture({ requests: [metaHit({ id: '1112223334445', ev: 'PageView' })] })
  assert.equal(detect(capture).status, STATUSES.missing)
})

test('loader seen, zero successful hits -> not_firing, naming the loader sdkid', () => {
  const capture = makeCapture({
    requests: [tiktokLoader({ sdkid: CODE }), tiktokHit({ code: CODE, event: 'Pageview', failure: 'net::ERR_BLOCKED_BY_CLIENT' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.notFiring)
  assert.equal(finding.detail, `The TikTok Pixel library loaded but pixel ${CODE} sent no events.`)
  assert.deepEqual(finding.observed_values, {
    pixel_ids: [],
    declared_ids: [CODE],
    events: [],
    hit_count: 0,
    failed_hit_count: 1,
    loader_seen: true,
  })
})

test('a loader sdkid outside the code pattern is not declared', () => {
  const finding = detect(makeCapture({ requests: [tiktokLoader({ sdkid: 'not-a-code' })] }))
  assert.equal(finding.status, STATUSES.notFiring)
  assert.deepEqual(finding.observed_values.declared_ids, [])
  assert.match(finding.detail, /\(none declared\)/)
})

test('more than one pixel code -> mismatched', () => {
  const capture = makeCapture({
    requests: [
      tiktokHit({ code: CODE, event: 'Pageview', tMs: 1000 }),
      tiktokHit({ code: 'CAURORA0TIKTOK01', event: 'Pageview', tMs: 1100 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.equal(finding.detail, `More than one TikTok Pixel sent events from this page: ${CODE}, CAURORA0TIKTOK01.`)
})

test('hits without a Pageview -> mismatched', () => {
  const finding = detect(makeCapture({ requests: [tiktokHit({ code: CODE, event: 'CompletePayment' })] }))
  assert.equal(finding.status, STATUSES.mismatched)
  assert.equal(finding.detail, `TikTok Pixel ${CODE} sent events (CompletePayment) but no Pageview.`)
})

test('Meta-cased PageView is not a TikTok Pageview', () => {
  const finding = detect(makeCapture({ requests: [tiktokHit({ code: CODE, event: 'PageView' })] }))
  assert.equal(finding.status, STATUSES.mismatched)
})

test('exactly one pixel code with a Pageview -> ok', () => {
  const capture = makeCapture({
    requests: [
      tiktokLoader({ sdkid: CODE }),
      tiktokHit({ code: CODE, event: 'Pageview' }),
      tiktokHit({ code: CODE, event: 'ClickButton', tMs: 1200 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.equal(finding.detail, `TikTok Pixel ${CODE} sent Pageview and 2 event(s) in total.`)
  assert.deepEqual(finding.observed_values, {
    pixel_ids: [CODE],
    declared_ids: [CODE],
    events: ['ClickButton', 'Pageview'],
    hit_count: 2,
    failed_hit_count: 0,
    loader_seen: true,
  })
})

test('a blocked hit with no loader and no pixel code is missing, not a bogus mismatch with "undefined"', () => {
  const capture = makeCapture({
    requests: [tiktokHit({ code: undefined, event: 'Pageview', failure: 'net::ERR_BLOCKED_BY_CLIENT' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.missing)
  assert.ok(!finding.detail.includes('undefined'))
})

test('a hit body that is not the JSON payload counts as a hit with no code or event', () => {
  const hit = { ...tiktokHit({ code: CODE, event: 'Pageview' }), body: { kind: 'raw', value: 'garbage' } }
  const finding = detect(makeCapture({ requests: [hit] }))
  assert.equal(finding.observed_values.hit_count, 1)
  assert.deepEqual(finding.observed_values.pixel_ids, [])
  assert.deepEqual(finding.observed_values.events, [])
  assert.equal(finding.detail, 'TikTok Pixel (none declared) sent events (none named) but no Pageview.')
})

test('a non-string code or event in the JSON payload is ignored', () => {
  const hit = { ...tiktokHit(), body: { kind: 'json', value: { event: 42, context: { pixel: { code: { nested: true } } } } } }
  const finding = detect(makeCapture({ requests: [hit] }))
  assert.deepEqual(finding.observed_values.pixel_ids, [])
  assert.deepEqual(finding.observed_values.events, [])
})

test('tag_names is always an empty array', () => {
  assert.deepEqual(detect(makeCapture()).tag_names, [])
})
