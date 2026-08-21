import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { gradeAudit, gradeTrigger, verdict } from '../../eval/grade.mjs'
import { parseReport } from '../../eval/report.mjs'
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

const triggerRun = (overrides) => ({ id: 'check-tracking', kind: 'positive', loaded: true, ...overrides })

const auditRun = (overrides) => ({
  name: 'healthy',
  expected: HEALTHY,
  parsed: parseReport(reportText()),
  skillLoaded: true,
  failure: null,
  ...overrides,
})

const messages = (grade) => grade.violations.join(' | ')

describe('trigger grading', () => {
  it('passes when every phrasing loads and no unrelated one does', () => {
    const grade = gradeTrigger([
      triggerRun({ id: 'a' }),
      triggerRun({ id: 'b' }),
      { id: 'plan', kind: 'negative', loaded: false },
    ])
    assert.deepEqual(grade.violations, [])
    assert.equal(grade.metrics.overallLoadRate, 1)
  })

  it('fails a phrasing that loads too rarely, naming the prompt', () => {
    const grade = gradeTrigger([
      triggerRun({ id: 'flaky', loaded: true }),
      triggerRun({ id: 'flaky', loaded: false }),
      triggerRun({ id: 'flaky', loaded: false }),
    ])
    assert.match(messages(grade), /prompt "flaky" loaded the skill in 1\/3/)
    assert.equal(grade.metrics.byPrompt[0].rate, 0.333)
  })

  it('fails on the overall rate even when each prompt clears its own bar', () => {
    const grade = gradeTrigger(
      ['a', 'b', 'c', 'd', 'e'].flatMap((id) => [
        triggerRun({ id, loaded: true }),
        triggerRun({ id, loaded: true }),
        triggerRun({ id, loaded: true }),
        triggerRun({ id, loaded: true }),
        triggerRun({ id, loaded: false }),
      ])
    )
    assert.deepEqual(
      grade.metrics.byPrompt.map((entry) => entry.rate),
      [0.8, 0.8, 0.8, 0.8, 0.8]
    )
    assert.match(messages(grade), /overall load rate 0\.8 is below 0\.9/)
  })

  it('caps unrelated prompts pulling the skill in', () => {
    const negatives = ['plan', 'cpc', 'snippet'].map((id) => ({ id, kind: 'negative', loaded: true }))
    const grade = gradeTrigger([triggerRun({}), ...negatives])
    assert.match(messages(grade), /3\/3 unrelated run\(s\) loaded the skill \(plan, cpc, snippet\)/)
  })

  it('tolerates one negative control in four, which is the stated allowance', () => {
    const negatives = ['plan', 'cpc', 'snippet', 'report'].map((id, index) => ({
      id,
      kind: 'negative',
      loaded: index === 0,
    }))
    const grade = gradeTrigger([triggerRun({}), ...negatives])
    assert.deepEqual(grade.violations, [])
    assert.equal(grade.metrics.falseTriggerRate, 0.25)
  })

  // An absolute cap would tighten as repeats rise, punishing the very knob that
  // makes the measurement better.
  it('judges false triggers as a rate, so repeats do not move the bar', () => {
    const once = ['a', 'b', 'c', 'd'].map((id, index) => ({ id, kind: 'negative', loaded: index === 0 }))
    const thrice = once.flatMap((run) => [run, { ...run }, { ...run }])
    assert.deepEqual(gradeTrigger([triggerRun({}), ...once]).violations, [])
    assert.deepEqual(gradeTrigger([triggerRun({}), ...thrice]).violations, [])
  })

  it('fails a layer that ran nothing, rather than reporting a clean sweep', () => {
    assert.match(messages(gradeTrigger([])), /no trigger runs were executed/)
    assert.match(gradeAudit([]).violations.join(' '), /no audit runs were executed/)
  })

  it('counts a run that never completed as a violation, not as a non-load', () => {
    const grade = gradeTrigger([triggerRun({ failure: 'claude timed out', loaded: false })])
    assert.match(messages(grade), /1 trigger run\(s\) did not complete/)
  })
})

describe('audit grading', () => {
  it('passes a clean healthy case', () => {
    const grade = gradeAudit([auditRun({})])
    assert.deepEqual(grade.violations, [])
    assert.deepEqual(grade.metrics.totals, {
      missedCritical: 0,
      missedSoft: 0,
      falsePositives: 0,
      wrongStatus: 0,
      unusable: 0,
    })
  })

  it('fails when the report calls a not_firing signal working', () => {
    const grade = gradeAudit([
      auditRun({
        name: 'missing-conversion-linker',
        expected: { ...HEALTHY, conversion_linker: 'not_firing' },
        parsed: parseReport(reportText()),
      }),
    ])
    assert.equal(grade.metrics.totals.missedCritical, 1)
    assert.match(messages(grade), /1 missed critical defect\(s\) across the run, cap is 0/)
  })

  it('lets one missed `missing` through, since it may read as deliberate', () => {
    const grade = gradeAudit([
      auditRun({ expected: { ...HEALTHY, consent_mode: 'missing' }, parsed: parseReport(reportText()) }),
    ])
    assert.equal(grade.metrics.totals.missedSoft, 1)
    assert.deepEqual(grade.violations, [])
  })

  it('counts the right signal with the wrong status separately from a miss', () => {
    const grade = gradeAudit([
      auditRun({
        expected: { ...HEALTHY, meta_pixel: 'mismatched' },
        parsed: parseReport(reportText({ meta_pixel: 'not_firing' })),
      }),
    ])
    assert.deepEqual(grade.metrics.perCase[0].wrongStatus, [
      'meta_pixel: expected mismatched, reported not_firing',
    ])
    assert.equal(grade.metrics.totals.missedCritical, 0)
  })

  it('counts a defect claimed against a healthy signal as a false positive', () => {
    const grade = gradeAudit([auditRun({ parsed: parseReport(reportText({ ga4_config: 'not_firing' })) })])
    assert.equal(grade.metrics.totals.falsePositives, 1)
    assert.deepEqual(grade.violations, [])
  })

  it('fails a single case that invents two defects', () => {
    const grade = gradeAudit([
      auditRun({ parsed: parseReport(reportText({ ga4_config: 'not_firing', meta_pixel: 'mismatched' })) }),
    ])
    assert.match(messages(grade), /2 false positive\(s\), per-case cap is 1/)
  })

  it('fails on the total when no single case exceeds the per-case cap', () => {
    const overreporting = parseReport(reportText({ ga4_config: 'mismatched' }))
    const grade = gradeAudit([
      auditRun({ name: 'a', parsed: overreporting }),
      auditRun({ name: 'b', parsed: overreporting }),
      auditRun({ name: 'c', parsed: overreporting }),
    ])
    assert.match(messages(grade), /3 false positive\(s\) across the run, cap is 2/)
  })

  it('flags a critical defect named in the table but given no detail block', () => {
    const grade = gradeAudit([
      auditRun({
        expected: { ...HEALTHY, conversion_linker: 'not_firing' },
        parsed: parseReport(reportText({ conversion_linker: 'not_firing' }, { detail: false })),
      }),
    ])
    assert.match(messages(grade), /conversion_linker is not_firing but got no detail block/)
  })

  // The answer key sits beside the golden capture, so a run that opened it did
  // not derive its report — its verdict is worthless, not merely suspect.
  it('discards a run that read the golden findings, however right its report', () => {
    const grade = gradeAudit([
      auditRun({
        name: 'peeked',
        expected: { ...HEALTHY, conversion_linker: 'not_firing' },
        parsed: parseReport(reportText({ conversion_linker: 'not_firing' })),
        tainted: ['Read', 'Read'],
      }),
    ])
    assert.equal(grade.metrics.totals.unusable, 1)
    assert.equal(grade.metrics.totals.missedCritical, 0)
    assert.match(messages(grade), /peeked: unusable run — read the golden findings via Read/)
  })

  it('flags a report produced without the skill ever loading', () => {
    const grade = gradeAudit([auditRun({ skillLoaded: false })])
    assert.match(messages(grade), /report produced without loading the skill/)
  })

  it('treats an errored run and an unparseable report alike as unusable', () => {
    const grade = gradeAudit([
      auditRun({ name: 'crashed', failure: 'claude exited 1' }),
      auditRun({ name: 'prose', parsed: parseReport('I could not do that.') }),
    ])
    assert.equal(grade.metrics.totals.unusable, 2)
    assert.match(messages(grade), /crashed: unusable run — claude exited 1/)
    assert.match(messages(grade), /prose: unusable run — report named no signal/)
  })

  it('grades against the tolerances it is given, not a global', () => {
    const strict = { ...TOLERANCES, maxFalsePositivesPerCase: 0 }
    const runs = [auditRun({ parsed: parseReport(reportText({ ga4_config: 'not_firing' })) })]
    assert.deepEqual(gradeAudit(runs).violations, [])
    assert.match(messages(gradeAudit(runs, strict)), /per-case cap is 0/)
  })
})

describe('verdict', () => {
  it('passes only when no layer objects, and tags each violation with its layer', () => {
    const clean = gradeTrigger([triggerRun({})])
    assert.deepEqual(verdict([clean]), { passed: true, violations: [] })

    const dirty = gradeAudit([auditRun({ skillLoaded: false })])
    const combined = verdict([clean, dirty])
    assert.equal(combined.passed, false)
    assert.ok(combined.violations.every((text) => text.startsWith('[audit] ')))
  })
})
