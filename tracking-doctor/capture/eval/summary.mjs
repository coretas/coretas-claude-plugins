/**
 * Renders the verdict. The nightly run exists to say pass or fail against stated
 * tolerances, so raw model output never reaches the log on its own — it goes to
 * the JSON artefact, and this is what a human reads.
 */
import { TOLERANCES } from './tolerances.mjs'

export function buildSummary({ layers, model, cliVersion, startedAt, durationMs, costUsd }) {
  const violations = layers.flatMap((layer) => layer.violations.map((text) => `[${layer.layer}] ${text}`))
  return {
    schemaVersion: 1,
    verdict: violations.length === 0 ? 'pass' : 'fail',
    model,
    cliVersion,
    startedAt,
    durationMs,
    costUsd,
    tolerances: TOLERANCES,
    violations,
    layers,
  }
}

export function renderSummary(summary) {
  const lines = [
    `tracking-doctor eval — ${summary.verdict.toUpperCase()}`,
    `model ${summary.model ?? 'unknown'} · cli ${summary.cliVersion ?? 'unknown'}` +
      `${summary.costUsd == null ? '' : ` · $${summary.costUsd.toFixed(4)}`}`,
    '',
  ]

  for (const layer of summary.layers) {
    lines.push(`## ${layer.layer}`)
    lines.push(...describe(layer))
    lines.push('')
  }

  if (summary.violations.length === 0) lines.push('No tolerance exceeded.')
  else {
    lines.push(`${summary.violations.length} tolerance violation(s):`)
    lines.push(...summary.violations.map((text) => `  - ${text}`))
  }

  return `${lines.join('\n')}\n`
}

function describe(layer) {
  if (layer.layer === 'run') return layer.violations
  if (layer.layer === 'trigger') {
    const { metrics } = layer
    return [
      `load rate ${metrics.overallLoadRate} over ${metrics.positives} run(s), ` +
        `false trigger rate ${metrics.falseTriggerRate} over ${metrics.negatives} control run(s)`,
      ...metrics.byPrompt.map((entry) => `  ${entry.id}: ${entry.loaded}/${entry.attempts}`),
    ]
  }

  const { totals, perCase } = layer.metrics
  return [
    `${layer.metrics.cases} case(s) · missed critical ${totals.missedCritical} · missed soft ` +
      `${totals.missedSoft} · false positives ${totals.falsePositives} · wrong status ` +
      `${totals.wrongStatus} · unusable ${totals.unusable}`,
    ...perCase.map((entry) => `  ${entry.name}: ${caseLine(entry)}`),
  ]
}

function caseLine(entry) {
  if (entry.unusable) return `unusable (${entry.reason})`
  const problems = [...entry.missedCritical, ...entry.missedSoft, ...entry.falsePositives, ...entry.wrongStatus]
  return problems.length === 0 ? 'clean' : problems.join('; ')
}

export const exitCodeFor = (summary) => (summary.verdict === 'pass' ? 0 : 1)
