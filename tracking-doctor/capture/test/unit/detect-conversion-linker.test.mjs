import assert from 'node:assert/strict'
import { test } from 'node:test'

import { collectEvidence } from '../../lib/detect/evidence.mjs'
import { detectConversionLinker } from '../../lib/detect/signals/conversion-linker.mjs'
import { STATUSES } from '../../lib/detect/vocabulary.mjs'
import { adsHit, ga4Hit, makeCapture } from '../helpers/captures.mjs'

const detect = (capture) => detectConversionLinker(collectEvidence(capture))

test('no Google tagging at all -> missing', () => {
  assert.equal(detect(makeCapture()).status, STATUSES.missing)
})

test('cookie-only evidence is ok', () => {
  const capture = makeCapture({
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view' })],
    cookies: [{ name: '_gcl_au', domain: '.example.test', path: '/', secure: true, httpOnly: false, sameSite: 'Lax', session: false }],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.match(finding.detail, /_gcl_au cookie/)
})

test('param-only evidence is ok', () => {
  const capture = makeCapture({
    requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view', extraParams: { gclid: 'abc123' } })],
  })
  const finding = detect(capture)
  assert.equal(finding.status, STATUSES.ok)
  assert.match(finding.detail, /gclid param/)
})

test('Google tagging present but no linker evidence -> not_firing', () => {
  const capture = makeCapture({ requests: [ga4Hit({ tid: 'G-ABC123', en: 'page_view' })] })
  assert.equal(detect(capture).status, STATUSES.notFiring)
})

test('Ads tagging alone also counts as Google tagging present', () => {
  const capture = makeCapture({ requests: [adsHit({ id: '123456789', label: 'abc' })] })
  assert.equal(detect(capture).status, STATUSES.notFiring)
})

test('tag_names is always an empty array', () => {
  assert.deepEqual(detect(makeCapture()).tag_names, [])
})
