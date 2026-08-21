import assert from 'node:assert/strict'
import { test } from 'node:test'

import { EMITTABLE_STATUSES, SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'
import { findingsPath, goldenFixtureNames, readGolden } from '../helpers/golden.mjs'

/**
 * What each fixture was written to prove. Signals absent from an entry must be
 * `ok`: a fixture carries one deliberate defect, and a second non-ok signal
 * means the fixture drifted or a rule leaked into a neighbour.
 *
 * This is what stops `npm run goldens:update` from blessing a bug. The generator
 * writes whatever the render produced; this decides whether that was right.
 */
const INTENT = {
  healthy: {},
  'missing-conversion-linker': { conversion_linker: 'not_firing' },
  'wrong-ga4-id': { ga4_config: 'mismatched' },
  'pixel-without-pageview': { meta_pixel: 'mismatched' },
  'duplicate-gtag': { ga4_event_coverage: 'mismatched' },
  'consent-default-denied': { consent_mode: 'mismatched' },
  'paused-tag': {
    ga4_config: 'not_firing',
    meta_pixel: 'not_firing',
    conversion_linker: 'not_firing',
    google_ads_conversion: 'not_firing',
    ga4_event_coverage: 'missing',
    consent_mode: 'missing',
  },
}

const names = await goldenFixtureNames()
const statusesOf = async (name) => {
  const { findings } = await readGolden(findingsPath(name))
  return Object.fromEntries(findings.map((finding) => [finding.signal, finding.status]))
}

test('every fixture on disk has an intent entry, and every entry has a fixture', () => {
  assert.deepEqual(names, Object.keys(INTENT).sort())
})

for (const name of names) {
  test(`${name}: the golden carries exactly the defect the fixture was written for`, async () => {
    const actual = await statusesOf(name)
    const expected = Object.fromEntries(
      SIGNAL_ORDER.map((signal) => [signal, INTENT[name][signal] ?? 'ok'])
    )
    assert.deepEqual(actual, expected)
  })
}

test('paused is never emitted, for any golden', async () => {
  for (const name of names) {
    for (const [signal, status] of Object.entries(await statusesOf(name))) {
      assert.notEqual(status, 'paused', `${name}/${signal} emitted paused`)
      assert.ok(EMITTABLE_STATUSES.includes(status), `${name}/${signal} has status ${status}`)
    }
  }
})

test('the fixture set exercises every emittable status', async () => {
  const seen = new Set()
  for (const name of names) {
    for (const status of Object.values(await statusesOf(name))) seen.add(status)
  }
  assert.deepEqual([...seen].sort(), [...EMITTABLE_STATUSES].sort())
})

test('every signal is non-ok in at least one fixture', async () => {
  const covered = new Set()
  for (const name of names) {
    for (const [signal, status] of Object.entries(await statusesOf(name))) {
      if (status !== 'ok') covered.add(signal)
    }
  }
  assert.deepEqual([...covered].sort(), [...SIGNAL_ORDER].sort())
})

test('exactly one fixture is clean, so a trigger-happy rule has somewhere to fail', async () => {
  const clean = []
  for (const name of names) {
    if (Object.values(await statusesOf(name)).every((status) => status === 'ok')) clean.push(name)
  }
  assert.deepEqual(clean, ['healthy'])
})
