/**
 * Wires the two layers: does the skill load, and having loaded, does the report
 * name the right defect. The runner is injectable so the wiring is testable
 * without spending a token — the fake runner in the unit suite is the whole
 * reason this is not inlined in the script.
 */
import { auditPrompt } from './cases.mjs'
import { SKILL_NAME, TOOL_SETS, runClaude } from './claude.mjs'
import { gradeAudit, gradeTrigger } from './grade.mjs'
import { parseReport } from './report.mjs'
import { stageCapture } from './stage.mjs'
import { answerKeyReads, costUsd, finalText, runFailure, skillLoads } from './stream.mjs'
import { BUDGET_USD, TOLERANCES } from './tolerances.mjs'

export async function runTriggerLayer(options, deps = {}) {
  const run = deps.run ?? runClaude
  const repeats = Math.max(1, options.repeats ?? 1)
  const runs = []

  for (const entry of options.cases) {
    for (let attempt = 1; attempt <= repeats; attempt += 1) {
      const result = await attempt_(run, {
        prompt: entry.prompt,
        tools: [...TOOL_SETS.trigger],
        model: options.model,
        maxBudgetUsd: BUDGET_USD.trigger,
        timeoutMs: options.timeoutMs,
      }, deps)
      const loads = skillLoads(result.events, SKILL_NAME)
      runs.push({
        id: entry.id,
        kind: entry.kind,
        attempt,
        prompt: entry.prompt,
        loaded: loads.length > 0,
        via: [...new Set(loads.map((load) => load.via))],
        failure: result.spawnError ?? failureOf(result),
        costUsd: costUsd(result.events),
      })
      deps.onRun?.(runs.at(-1))
    }
  }

  return { runs, grade: gradeTrigger(runs, options.tolerances ?? TOLERANCES) }
}

export async function runAuditLayer(options, deps = {}) {
  const run = deps.run ?? runClaude
  const runs = []

  for (const auditCase of options.cases) {
    const staged = await (deps.stage ?? stageCapture)(auditCase.capture)
    let result
    try {
      result = await attempt_(run, {
        prompt: auditPrompt(staged.path),
        tools: [...TOOL_SETS.audit],
        model: options.model,
        maxBudgetUsd: BUDGET_USD.audit,
        timeoutMs: options.timeoutMs,
      }, deps)
    } finally {
      await staged.cleanup()
    }

    const text = finalText(result.events)
    runs.push({
      name: auditCase.name,
      expected: auditCase.expected,
      parsed: parseReport(text),
      report: text,
      skillLoaded: skillLoads(result.events, SKILL_NAME).length > 0,
      tainted: answerKeyReads(result.events),
      failure: result.spawnError ?? failureOf(result),
      costUsd: costUsd(result.events),
    })
    deps.onRun?.(runs.at(-1))
  }

  return { runs, grade: gradeAudit(runs, options.tolerances ?? TOLERANCES) }
}

/**
 * A rejected spawn must cost one run, not the whole layer: everything already
 * collected still has to reach the summary and the artefact.
 */
async function attempt_(run, options, deps) {
  try {
    return await run(options, deps)
  } catch (error) {
    return { events: [], malformed: [], exitCode: null, timedOut: false, spawnError: String(error?.message ?? error) }
  }
}

function failureOf(result) {
  if (result.timedOut) return 'claude timed out'
  return runFailure(result.events, { exitCode: result.exitCode })
}

export const totalCost = (runs) =>
  runs.reduce((sum, run) => (typeof run.costUsd === 'number' ? sum + run.costUsd : sum), 0)
