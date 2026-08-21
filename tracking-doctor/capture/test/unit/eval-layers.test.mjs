import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { auditPrompt, caseFor } from '../../eval/cases.mjs'
import { TOOL_SETS } from '../../eval/claude.mjs'
import { runAuditLayer, runTriggerLayer, totalCost } from '../../eval/layers.mjs'
import { parseEvents } from '../../eval/stream.mjs'
import { BUDGET_USD } from '../../eval/tolerances.mjs'
import { buildStream, reportText, skillCall, textBlock, toolUse } from '../helpers/eval-stream.mjs'

function recorder(streamFor) {
  const seen = []
  const run = async (options) => {
    seen.push(options)
    return { ...parseEvents(streamFor(options)), exitCode: 0, timedOut: false, args: [] }
  }
  return { run, seen }
}

const loadedStream = (text) =>
  buildStream({ blocks: [skillCall(), textBlock('working')], result: { result: text } })

function fakeStage(path = '/tmp/tracking-doctor/eval-test/capture.json') {
  const cleaned = []
  const stage = async () => ({ dir: '/tmp/tracking-doctor/eval-test', path, cleanup: async () => cleaned.push(path) })
  return { stage, cleaned, path }
}

describe('trigger layer', () => {
  it('runs each prompt the requested number of times and records how it loaded', async () => {
    const { run, seen } = recorder(() => loadedStream('done'))
    const cases = [{ id: 'a', kind: 'positive', prompt: 'check my tracking' }]
    const { runs, grade } = await runTriggerLayer({ cases, repeats: 3 }, { run })

    assert.equal(seen.length, 3)
    assert.deepEqual(
      runs.map((entry) => entry.attempt),
      [1, 2, 3]
    )
    assert.deepEqual(runs[0].via, ['skill-tool'])
    assert.equal(grade.metrics.overallLoadRate, 1)
  })

  it('gives every trigger run the Skill tool only, and the trigger budget', async () => {
    const { run, seen } = recorder(() => loadedStream('done'))
    await runTriggerLayer({ cases: [{ id: 'a', kind: 'positive', prompt: 'p' }] }, { run })
    assert.deepEqual(seen[0].tools, [...TOOL_SETS.trigger])
    assert.equal(seen[0].maxBudgetUsd, BUDGET_USD.trigger)
  })

  it('records a negative prompt that did not load as a pass, not a failure', async () => {
    const { run } = recorder(() => buildStream({ blocks: [textBlock('here is a plan')] }))
    const cases = [{ id: 'plan', kind: 'negative', prompt: 'write a plan' }]
    const { runs, grade } = await runTriggerLayer({ cases }, { run })
    assert.equal(runs[0].loaded, false)
    assert.deepEqual(grade.violations, [])
  })

  it('treats at least one repeat, whatever it is asked for', async () => {
    const { run, seen } = recorder(() => loadedStream('done'))
    await runTriggerLayer({ cases: [{ id: 'a', kind: 'positive', prompt: 'p' }], repeats: 0 }, { run })
    assert.equal(seen.length, 1)
  })
})

describe('audit layer', () => {
  it('grades the printed report against the golden expectations', async () => {
    const linker = await caseFor('missing-conversion-linker')
    const { run, seen } = recorder(() => loadedStream(reportText({ conversion_linker: 'not_firing' })))
    const { stage } = fakeStage()
    const { runs, grade } = await runAuditLayer({ cases: [linker] }, { run, stage })

    assert.deepEqual(seen[0].tools, [...TOOL_SETS.audit])
    assert.equal(runs[0].skillLoaded, true)
    assert.equal(runs[0].parsed.statuses.conversion_linker, 'not_firing')
    assert.deepEqual(grade.violations, [])
  })

  // The answer key lives beside the golden capture and this layer has Read and
  // Glob, so the prompt must never point into the fixture directory.
  it('runs against a staged copy, never the fixture path, and cleans it up', async () => {
    const linker = await caseFor('missing-conversion-linker')
    const { run, seen } = recorder(() => loadedStream(reportText({ conversion_linker: 'not_firing' })))
    const { stage, cleaned, path } = fakeStage()
    await runAuditLayer({ cases: [linker] }, { run, stage })

    assert.equal(seen[0].prompt, auditPrompt(path))
    assert.ok(!seen[0].prompt.includes('fixtures'))
    assert.deepEqual(cleaned, [path])
  })

  it('removes the staged copy even when the run throws', async () => {
    const linker = await caseFor('missing-conversion-linker')
    const { stage, cleaned, path } = fakeStage()
    const run = async () => {
      throw new Error('ENOENT claude')
    }
    const { runs } = await runAuditLayer({ cases: [linker] }, { run, stage })

    assert.deepEqual(cleaned, [path])
    assert.equal(runs[0].failure, 'ENOENT claude')
  })

  it('marks a run that read the golden findings as unusable, whatever it reported', async () => {
    const linker = await caseFor('missing-conversion-linker')
    const stream = () =>
      buildStream({
        blocks: [
          skillCall(),
          toolUse('Read', { file_path: '/repo/test/fixtures/golden/missing-conversion-linker.findings.json' }),
        ],
        result: { result: reportText({ conversion_linker: 'not_firing' }) },
      })
    const { run } = recorder(stream)
    const { stage } = fakeStage()
    const { runs, grade } = await runAuditLayer({ cases: [linker] }, { run, stage })

    assert.deepEqual(runs[0].tainted, ['Read'])
    assert.equal(grade.metrics.totals.unusable, 1)
    assert.match(grade.violations.join(' '), /read the golden findings/)
  })

  it('fails the layer when the report calls a fixture defect healthy', async () => {
    const linker = await caseFor('missing-conversion-linker')
    const { run } = recorder(() => loadedStream(reportText()))
    const { grade } = await runAuditLayer({ cases: [linker] }, { run, stage: fakeStage().stage })
    assert.equal(grade.metrics.totals.missedCritical, 1)
    assert.ok(grade.violations.length > 0)
  })

  it('marks a timed-out run unusable rather than reading its half-written report', async () => {
    const healthy = await caseFor('healthy')
    const run = async () => ({ events: [], malformed: [], exitCode: null, timedOut: true, args: [] })
    const { runs, grade } = await runAuditLayer({ cases: [healthy] }, { run, stage: fakeStage().stage })
    assert.equal(runs[0].failure, 'claude timed out')
    assert.equal(grade.metrics.totals.unusable, 1)
  })

  it('reports progress per run as it goes', async () => {
    const healthy = await caseFor('healthy')
    const { run } = recorder(() => loadedStream(reportText()))
    const observed = []
    await runAuditLayer({ cases: [healthy] }, { run, stage: fakeStage().stage, onRun: (entry) => observed.push(entry.name) })
    assert.deepEqual(observed, ['healthy'])
  })
})

describe('cost', () => {
  it('sums what the runs reported and ignores runs that reported none', () => {
    assert.equal(totalCost([{ costUsd: 0.02 }, { costUsd: null }, { costUsd: 0.03 }]), 0.05)
    assert.equal(totalCost([]), 0)
  })
})
