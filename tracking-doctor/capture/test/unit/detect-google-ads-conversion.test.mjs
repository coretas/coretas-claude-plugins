import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence } from '../../lib/detect/evidence.mjs'
import { detectGoogleAdsConversion } from '../../lib/detect/signals/google-ads-conversion.mjs'
import { STATUSES } from '../../lib/detect/vocabulary.mjs'
import { adsHit, loader, makeCapture } from '../helpers/captures.mjs'

const detect = (capture) => detectGoogleAdsConversion(collectEvidence(capture))

test('no declared id and no Ads hit -> missing', () => {
  assert.equal(detect(makeCapture()).status, STATUSES.missing)
})

test('declared id with zero successful hits -> not_firing', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'AW-123456789' }), adsHit({ id: '123456789', label: 'abc', failure: 'net::ERR_FAILED' })],
  })
  assert.equal(detect(capture).status, STATUSES.notFiring)
})

test('two distinct declared ids -> mismatched', () => {
  const capture = makeCapture({
    requests: [
      loader({ id: 'AW-123456789', tMs: 100 }),
      loader({ id: 'AW-987654321', tMs: 200 }),
      adsHit({ id: '123456789', label: 'abc' }),
    ],
  })
  assert.equal(detect(capture).status, STATUSES.mismatched)
})

test('observed conversion id does not match the declared id (digit comparison) -> mismatched', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'AW-123456789' }), adsHit({ id: '999999999', label: 'abc' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
  assert.match(finding.detail, /not configured/)
})

test('a near-miss id that is a substring of the declared id is still mismatched, not a false ok', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'AW-1234567899' }), adsHit({ id: '234567899', label: 'abc' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.mismatched)
})

test('declared id matching the observed digits exactly -> ok', () => {
  const capture = makeCapture({
    requests: [loader({ id: 'AW-123456789' }), adsHit({ id: '123456789', label: 'abc' })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.deepEqual(finding.observed_values.conversion_ids_observed, ['123456789'])
})

test('remarketing hits with no labelled conversion stay ok, not a failing status', () => {
  const capture = makeCapture({ requests: [adsHit({ id: '123456789', kind: 'remarketing' })] })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.equal(finding.observed_values.remarketing_only, true)
  assert.match(finding.detail, /remarketing fired/)
})

test('tag_names is always an empty array', () => {
  assert.deepEqual(detect(makeCapture()).tag_names, [])
})
