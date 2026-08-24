import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import {
  CRITICAL_STATUSES,
  SIGNAL_LABELS,
  STATUS_LABELS,
  isCritical,
  signalFromLabel,
  statusFromLabel,
} from '../../eval/labels.mjs'
import { EMITTABLE_STATUSES, SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'

const SKILL_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'skills',
  'tracking-doctor',
  'SKILL.md'
)

describe('eval labels', () => {
  it('labels exactly the six signals', () => {
    assert.deepEqual(Object.keys(SIGNAL_LABELS).sort(), [...SIGNAL_ORDER].sort())
  })

  it('labels exactly the emittable statuses, never paused', () => {
    assert.deepEqual(Object.keys(STATUS_LABELS).sort(), [...EMITTABLE_STATUSES].sort())
    assert.ok(!('paused' in STATUS_LABELS))
  })

  // The parser grades what SKILL.md tells the model to print, so a label changed
  // in one place and not the other has to fail here rather than at 3am.
  it('every label pair is the one SKILL.md documents', async () => {
    // SKILL.md wraps at 100 columns, so a pair can straddle a newline.
    const text = (await readFile(SKILL_PATH, 'utf8')).replace(/\s+/g, ' ')
    for (const [signal, label] of Object.entries(SIGNAL_LABELS)) {
      assert.ok(text.includes(`\`${signal}\` → ${label}`), `SKILL.md is missing ${signal} → ${label}`)
    }
    for (const [status, label] of Object.entries(STATUS_LABELS)) {
      assert.ok(text.includes(`\`${status}\` → ${label}`), `SKILL.md is missing ${status} → ${label}`)
    }
  })

  it('reads a label back to its signal, tolerating case, backticks and padding', () => {
    assert.equal(signalFromLabel(' GA4 configuration '), 'ga4_config')
    assert.equal(signalFromLabel('`Consent mode`'), 'consent_mode')
    assert.equal(signalFromLabel('consent_mode'), 'consent_mode')
    assert.equal(signalFromLabel('cookies'), null)
  })

  it('reads a status label back, and accepts the raw vocabulary string', () => {
    assert.equal(statusFromLabel('not firing'), 'not_firing')
    assert.equal(statusFromLabel('Not Firing'), 'not_firing')
    assert.equal(statusFromLabel('not_firing'), 'not_firing')
    assert.equal(statusFromLabel('inconsistent'), 'mismatched')
    assert.equal(statusFromLabel('broken'), null)
  })

  it('never accepts paused, which the plugin cannot evidence', () => {
    assert.equal(statusFromLabel('paused'), null)
  })

  it('treats not_firing and mismatched as critical, missing as soft', () => {
    assert.deepEqual([...CRITICAL_STATUSES].sort(), ['mismatched', 'not_firing'])
    assert.ok(isCritical('not_firing'))
    assert.ok(!isCritical('missing'))
    assert.ok(!isCritical('ok'))
  })
})
