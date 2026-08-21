/**
 * Turns runs into a verdict against TOLERANCES. Pure: it takes already-collected
 * runs, so the thresholds are testable without spending a token.
 */
import { STATUSES } from '../lib/detect/vocabulary.mjs'
import { isCritical } from './labels.mjs'
import { isUsableReport } from './report.mjs'
import { TOLERANCES } from './tolerances.mjs'

const ratio = (part, whole) => (whole === 0 ? 1 : part / whole)
const round = (value) => Math.round(value * 1000) / 1000

export function gradeTrigger(runs, tolerances = TOLERANCES) {
  const violations = []
  // 0/0 is 1, so a layer that ran nothing would otherwise render as a clean
  // sweep: a mistyped selector has to be a red run, not a green one.
  if (runs.length === 0) violations.push('no trigger runs were executed')
  const positives = runs.filter((run) => run.kind === 'positive')
  const negatives = runs.filter((run) => run.kind === 'negative')
  const unusable = runs.filter((run) => run.failure)

  const byPrompt = []
  for (const id of [...new Set(positives.map((run) => run.id))]) {
    const attempts = positives.filter((run) => run.id === id)
    const loaded = attempts.filter((run) => run.loaded)
    const rate = round(ratio(loaded.length, attempts.length))
    byPrompt.push({ id, attempts: attempts.length, loaded: loaded.length, rate })
    if (rate < tolerances.minLoadRatePerPrompt) {
      violations.push(
        `prompt "${id}" loaded the skill in ${loaded.length}/${attempts.length} run(s) ` +
          `(${rate}), below ${tolerances.minLoadRatePerPrompt}`
      )
    }
  }

  const overall = round(ratio(positives.filter((run) => run.loaded).length, positives.length))
  if (overall < tolerances.minLoadRateOverall) {
    violations.push(`overall load rate ${overall} is below ${tolerances.minLoadRateOverall}`)
  }

  const falseTriggers = negatives.filter((run) => run.loaded)
  // A rate, not a count: with `--repeats 3` an absolute cap silently becomes
  // three times stricter, which would punish raising the repeat count.
  const falseTriggerRate = negatives.length === 0 ? 0 : round(falseTriggers.length / negatives.length)
  if (negatives.length > 0 && falseTriggerRate > tolerances.maxFalseTriggerRate) {
    violations.push(
      `${falseTriggers.length}/${negatives.length} unrelated run(s) loaded the skill ` +
        `(${[...new Set(falseTriggers.map((run) => run.id))].join(', ')}), rate ${falseTriggerRate} ` +
        `above ${tolerances.maxFalseTriggerRate}`
    )
  }

  if (unusable.length > tolerances.maxUnusableRuns) {
    violations.push(`${unusable.length} trigger run(s) did not complete, cap is ${tolerances.maxUnusableRuns}`)
  }

  return {
    layer: 'trigger',
    metrics: {
      positives: positives.length,
      negatives: negatives.length,
      overallLoadRate: overall,
      falseTriggerRate,
      falseTriggers: falseTriggers.map((run) => run.id),
      unusable: unusable.map((run) => `${run.id}: ${run.failure}`),
      byPrompt,
    },
    violations,
  }
}

export function gradeAudit(runs, tolerances = TOLERANCES) {
  const violations = []
  if (runs.length === 0) violations.push('no audit runs were executed')
  const perCase = runs.map((run) => gradeAuditRun(run, tolerances, violations))

  const total = (key) => perCase.reduce((sum, entry) => sum + entry[key].length, 0)
  const totals = {
    missedCritical: total('missedCritical'),
    missedSoft: total('missedSoft'),
    falsePositives: total('falsePositives'),
    wrongStatus: total('wrongStatus'),
    unusable: perCase.filter((entry) => entry.unusable).length,
  }

  const cap = (count, limit, what) => {
    if (count > limit) violations.push(`${count} ${what} across the run, cap is ${limit}`)
  }
  cap(totals.missedCritical, tolerances.maxMissedCriticalDefects, 'missed critical defect(s)')
  cap(totals.missedSoft, tolerances.maxMissedSoftDefects, 'missed soft defect(s)')
  cap(totals.falsePositives, tolerances.maxFalsePositivesTotal, 'false positive(s)')
  cap(totals.wrongStatus, tolerances.maxWrongStatusTotal, 'wrong status(es)')
  cap(totals.unusable, tolerances.maxUnusableRuns, 'unusable run(s)')

  return { layer: 'audit', metrics: { cases: perCase.length, totals, perCase }, violations }
}

function gradeAuditRun(run, tolerances, violations) {
  const entry = {
    name: run.name,
    skillLoaded: Boolean(run.skillLoaded),
    unusable: false,
    missedCritical: [],
    missedSoft: [],
    falsePositives: [],
    wrongStatus: [],
    reported: run.parsed?.statuses ?? {},
  }

  if (run.tainted?.length) {
    entry.unusable = true
    entry.reason = `read the golden findings via ${[...new Set(run.tainted)].join(', ')}`
    violations.push(`${run.name}: unusable run — ${entry.reason}`)
    return entry
  }

  if (run.failure || !run.parsed || !isUsableReport(run.parsed)) {
    entry.unusable = true
    entry.reason = run.failure ?? 'report named no signal'
    violations.push(`${run.name}: unusable run — ${entry.reason}`)
    return entry
  }

  if (!entry.skillLoaded) violations.push(`${run.name}: report produced without loading the skill`)

  for (const [signal, expected] of Object.entries(run.expected)) {
    const reported = entry.reported[signal]

    if (expected === STATUSES.ok) {
      if (reported && reported !== STATUSES.ok) {
        entry.falsePositives.push(`${signal}: reported ${reported}, golden says ok`)
      }
      continue
    }

    if (!reported || reported === STATUSES.ok) {
      const bucket = isCritical(expected) ? entry.missedCritical : entry.missedSoft
      bucket.push(`${signal}: expected ${expected}, report says ${reported ?? 'nothing'}`)
      continue
    }

    if (reported !== expected) entry.wrongStatus.push(`${signal}: expected ${expected}, reported ${reported}`)
    else if (isCritical(expected) && !run.parsed.detailed.includes(signal)) {
      violations.push(`${run.name}: ${signal} is ${expected} but got no detail block`)
    }
  }

  if (entry.falsePositives.length > tolerances.maxFalsePositivesPerCase) {
    violations.push(
      `${run.name}: ${entry.falsePositives.length} false positive(s), per-case cap is ` +
        `${tolerances.maxFalsePositivesPerCase}`
    )
  }

  return entry
}

export function verdict(layers) {
  const violations = layers.flatMap((layer) => layer.violations.map((text) => `[${layer.layer}] ${text}`))
  return { passed: violations.length === 0, violations }
}
