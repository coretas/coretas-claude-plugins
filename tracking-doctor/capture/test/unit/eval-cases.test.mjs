import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { auditCases, auditPrompt, caseFor, defectsOf } from '../../eval/cases.mjs'
import { ALL_TRIGGER_CASES, NEGATIVE_PROMPTS, TRIGGER_PROMPTS } from '../../eval/prompts.mjs'
import { SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'
import { findingsPath, goldenFixtureNames, readGolden } from '../helpers/golden.mjs'

const BANNED = ['tracking-doctor', 'tracking doctor', 'skill', 'plugin', 'capture.mjs', 'playwright']

describe('trigger prompts', () => {
  it('never name the skill, the plugin or its tooling', () => {
    for (const entry of ALL_TRIGGER_CASES) {
      const lowered = entry.prompt.toLowerCase()
      for (const banned of BANNED) {
        assert.ok(!lowered.includes(banned), `prompt "${entry.id}" names "${banned}"`)
      }
    }
  })

  it('has unique ids across both sets', () => {
    const ids = ALL_TRIGGER_CASES.map((entry) => entry.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('carries both a realistic set and a negative control set', () => {
    assert.ok(TRIGGER_PROMPTS.length >= 5)
    assert.ok(NEGATIVE_PROMPTS.length >= 3)
    assert.deepEqual(
      [...new Set(ALL_TRIGGER_CASES.map((entry) => entry.kind))].sort(),
      ['negative', 'positive']
    )
  })

  it('gives every positive prompt a URL to hand over, and no negative one', () => {
    for (const entry of TRIGGER_PROMPTS) assert.match(entry.prompt, /https:\/\//)
    for (const entry of NEGATIVE_PROMPTS) assert.ok(!entry.prompt.includes('https://'))
  })
})

describe('audit cases', () => {
  it('covers every golden fixture, once', async () => {
    const names = (await auditCases()).map((entry) => entry.name)
    assert.deepEqual(names, await goldenFixtureNames())
  })

  // The golden findings are already the diffed contract; restating them here
  // would be a second source of truth, and it would drift.
  it('takes its expectations straight from the committed golden findings', async () => {
    for (const entry of await auditCases()) {
      const { findings } = await readGolden(findingsPath(entry.name))
      assert.deepEqual(entry.expected, Object.fromEntries(findings.map((f) => [f.signal, f.status])))
      assert.deepEqual(Object.keys(entry.expected).sort(), [...SIGNAL_ORDER].sort())
    }
  })

  it('points the prompt at the saved capture and forbids rendering', async () => {
    const entry = await caseFor('healthy')
    assert.ok(entry.prompt.includes(entry.capture))
    assert.match(entry.capture, /healthy\.capture\.json$/)
    assert.match(entry.prompt, /do not reach the network/i)
  })

  it('splits the paused-tag fixture into four critical and two soft defects', async () => {
    const entry = await caseFor('paused-tag')
    assert.deepEqual(entry.defects.critical, [
      'ga4_config',
      'meta_pixel',
      'conversion_linker',
      'google_ads_conversion',
    ])
    assert.deepEqual(entry.defects.soft, ['ga4_event_coverage', 'consent_mode'])
  })

  it('expects nothing of the healthy fixture', async () => {
    const entry = await caseFor('healthy')
    assert.deepEqual(entry.defects, { critical: [], soft: [] })
  })

  it('buckets a status by severity, never by signal', () => {
    const defects = defectsOf({ ga4_config: 'mismatched', meta_pixel: 'missing', consent_mode: 'ok' })
    assert.deepEqual(defects, { critical: ['ga4_config'], soft: ['meta_pixel'] })
  })

  it('names the capture path in the prompt it builds', () => {
    assert.match(auditPrompt('/tmp/x.json'), /\/tmp\/x\.json/)
  })
})
