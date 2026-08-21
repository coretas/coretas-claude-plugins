import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { gradeAudit, gradeTrigger } from '../../eval/grade.mjs'
import { parseReport } from '../../eval/report.mjs'
import { buildSummary, exitCodeFor, renderSummary } from '../../eval/summary.mjs'
import { TOLERANCES } from '../../eval/tolerances.mjs'
import { reportText } from '../helpers/eval-stream.mjs'

const HEALTHY = {
  ga4_config: 'ok',
  meta_pixel: 'ok',
  conversion_linker: 'ok',
  google_ads_conversion: 'ok',
  ga4_event_coverage: 'ok',
  consent_mode: 'ok',
}

const cleanTrigger = () => gradeTrigger([{ id: 'check-tracking', kind: 'positive', loaded: true }])

const auditWith = (parsed, expected = HEALTHY) =>
  gradeAudit([{ name: 'healthy', expected, parsed, skillLoaded: true, failure: null }])

const summaryOf = (layers, overrides = {}) =>
  buildSummary({ layers, model: 'sonnet', cliVersion: '2.1.197', startedAt: '2026-08-21T00:00:00Z', ...overrides })

describe('summary', () => {
  it('records the verdict, the model and the tolerances it was judged against', () => {
    const summary = summaryOf([cleanTrigger()], { costUsd: 0.1234, durationMs: 4000 })
    assert.equal(summary.verdict, 'pass')
    assert.equal(summary.model, 'sonnet')
    assert.equal(summary.cliVersion, '2.1.197')
    assert.deepEqual(summary.tolerances, TOLERANCES)
    assert.deepEqual(summary.violations, [])
  })

  it('fails and tags each violation with the layer that raised it', () => {
    const summary = summaryOf([cleanTrigger(), auditWith(parseReport('nothing here'))])
    assert.equal(summary.verdict, 'fail')
    assert.ok(summary.violations.every((text) => text.startsWith('[audit] ')))
  })

  it('exits 0 on a pass and 1 on a fail', () => {
    assert.equal(exitCodeFor(summaryOf([cleanTrigger()])), 0)
    assert.equal(exitCodeFor(summaryOf([auditWith(parseReport('nothing'))])), 1)
  })

  // The nightly log has to say pass or fail, not print the model's prose and
  // leave the reader to judge it.
  it('renders a verdict, per-layer numbers and every violation', () => {
    const rendered = renderSummary(
      summaryOf(
        [
          cleanTrigger(),
          auditWith(parseReport(reportText({ ga4_config: 'not_firing', meta_pixel: 'mismatched' }))),
        ],
        { costUsd: 0.5 }
      )
    )
    assert.match(rendered, /tracking-doctor eval — FAIL/)
    assert.match(rendered, /model sonnet · cli 2\.1\.197 · \$0\.5000/)
    assert.match(rendered, /## trigger\nload rate 1 over 1 run\(s\), false trigger rate 0 over 0 control run\(s\)/)
    assert.match(rendered, /## audit/)
    assert.match(rendered, /ga4_config: reported not_firing, golden says ok/)
  })

  it('says so plainly when nothing was exceeded', () => {
    assert.match(renderSummary(summaryOf([cleanTrigger()])), /No tolerance exceeded\./)
  })

  it('renders a clean case as clean and an unusable one with its reason', () => {
    const unusable = gradeAudit([
      { name: 'crashed', expected: HEALTHY, parsed: null, skillLoaded: true, failure: 'claude timed out' },
    ])
    const rendered = renderSummary(summaryOf([auditWith(parseReport(reportText())), unusable]))
    assert.match(rendered, /healthy: clean/)
    assert.match(rendered, /crashed: unusable \(claude timed out\)/)
  })

  it('renders an aborted run as its own layer, so the artefact says why it stopped', () => {
    const aborted = { layer: 'run', metrics: {}, violations: ['the run stopped early: ENOENT claude'] }
    const rendered = renderSummary(summaryOf([cleanTrigger(), aborted]))
    assert.match(rendered, /FAIL/)
    assert.match(rendered, /## run\nthe run stopped early: ENOENT claude/)
  })

  it('renders without a cost or a cli version rather than printing undefined', () => {
    const rendered = renderSummary(summaryOf([cleanTrigger()], { cliVersion: null }))
    assert.match(rendered, /cli unknown/)
    assert.ok(!rendered.includes('undefined'))
    assert.ok(!rendered.includes('NaN'))
  })
})
