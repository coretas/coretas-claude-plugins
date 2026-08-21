import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence } from '../../lib/detect/evidence.mjs'
import { detectMetaPixel } from '../../lib/detect/signals/meta-pixel.mjs'
import { STATUSES } from '../../lib/detect/vocabulary.mjs'
import { makeCapture, metaHit } from '../helpers/captures.mjs'

const detect = (capture) => detectMetaPixel(collectEvidence(capture))

test('no loader and no hit -> missing', () => {
  assert.equal(detect(makeCapture()).status, STATUSES.missing)
})

test('loader seen, zero successful hits -> not_firing', () => {
  const capture = makeCapture({
    requests: [
      { host: 'connect.facebook.net', path: '/en_US/fbevents.js', params: {}, tMs: 1, phase: 'pre-consent', route: null, failure: null },
      metaHit({ id: '1112223334445', ev: 'PageView', failure: 'net::ERR_BLOCKED_BY_CLIENT' }),
    ],
  })
  assert.equal(detect(capture).status, STATUSES.notFiring)
})

test('more than one pixel id -> mismatched', () => {
  const capture = makeCapture({
    requests: [
      metaHit({ id: '1112223334445', ev: 'PageView', tMs: 1000 }),
      metaHit({ id: '9998887776665', ev: 'PageView', tMs: 1100 }),
    ],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
})

test('hits without any PageView -> mismatched', () => {
  const capture = makeCapture({
    requests: [metaHit({ id: '1112223334445', ev: 'Purchase' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.match(finding.detail, /no PageView/)
})

test('exactly one pixel id with a PageView -> ok', () => {
  const capture = makeCapture({
    requests: [metaHit({ id: '1112223334445', ev: 'PageView' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.equal(finding.observed_values.hit_count, 1)
})

test('a blocked hit with no loader and no pixel id is missing, not a bogus mismatch with "undefined"', () => {
  const capture = makeCapture({
    requests: [metaHit({ id: undefined, ev: 'PageView', failure: 'net::ERR_BLOCKED_BY_CLIENT' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.missing)
  assert.ok(!finding.detail.includes('undefined'))
})

test('tag_names is always an empty array', () => {
  assert.deepEqual(detect(makeCapture()).tag_names, [])
})
