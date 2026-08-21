#!/usr/bin/env node
/**
 * The nightly harness. Reports a verdict against `eval/tolerances.mjs`; the raw
 * model output goes to the JSON artefact, never to the log as the answer.
 *
 * Needs credentials for `claude -p`, so it is not part of `npm test` — the pure
 * suite covers everything here except the API calls themselves.
 *
 *   node scripts/run-eval.mjs --layer trigger --repeats 3
 *   node scripts/run-eval.mjs --out /tmp/tracking-doctor/eval.json
 */
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { auditCases } from '../eval/cases.mjs'
import { CLAUDE_BIN, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from '../eval/claude.mjs'
import { runAuditLayer, runTriggerLayer, totalCost } from '../eval/layers.mjs'
import { ALL_TRIGGER_CASES } from '../eval/prompts.mjs'
import { buildSummary, exitCodeFor, renderSummary } from '../eval/summary.mjs'

const LAYERS = ['trigger', 'audit', 'all']

async function main(argv) {
  const args = parseArgs(argv)
  const triggerCases = selected(ALL_TRIGGER_CASES, args.only, (entry) => entry.id)
  const cases = selected(await auditCases(), args.only, (entry) => entry.name)
  assertSelection(args, triggerCases, cases)

  if (args.dryRun) {
    process.stdout.write(plan(args, triggerCases, cases))
    return 0
  }

  const startedAt = new Date().toISOString()
  const started = Date.now()
  const options = { model: args.model, timeoutMs: args.timeoutMs, repeats: args.repeats }
  const deps = { onRun: (run) => process.stderr.write(`${progress(run)}\n`) }
  const layers = []
  let cost = 0
  let aborted = null

  // Whatever completed still has to reach the summary and the artefact: a crash
  // in the second layer must not throw away the first one's verdict.
  try {
    if (args.layer !== 'audit') {
      const result = await runTriggerLayer({ ...options, cases: triggerCases }, deps)
      layers.push(result.grade)
      cost += totalCost(result.runs)
    }
    if (args.layer !== 'trigger') {
      const result = await runAuditLayer({ ...options, cases }, deps)
      layers.push(result.grade)
      cost += totalCost(result.runs)
    }
  } catch (error) {
    aborted = String(error?.message ?? error)
    layers.push({ layer: 'run', metrics: {}, violations: [`the run stopped early: ${aborted}`] })
  }

  const summary = buildSummary({
    layers,
    model: args.model,
    cliVersion: await cliVersion(),
    startedAt,
    durationMs: Date.now() - started,
    costUsd: cost,
  })

  if (args.out) {
    await mkdir(dirname(args.out), { recursive: true })
    await writeFile(args.out, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  }
  process.stdout.write(renderSummary(summary))
  return exitCodeFor(summary)
}

/**
 * A selector that matched nothing would otherwise run zero calls and report a
 * clean sweep, which is the most expensive kind of green there is.
 */
export function assertSelection(args, triggerCases, cases) {
  if (args.layer !== 'audit' && triggerCases.length === 0) {
    throw new Error(`No trigger prompt matched ${args.only.join(', ')}`)
  }
  if (args.layer !== 'trigger' && cases.length === 0) {
    throw new Error(`No audit fixture matched ${args.only.join(', ')}`)
  }
}

export function parseArgs(argv) {
  const args = {
    layer: 'all',
    repeats: 1,
    model: DEFAULT_MODEL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    out: null,
    only: [],
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (flag === '--layer') {
      if (!LAYERS.includes(value)) throw new Error(`--layer must be one of ${LAYERS.join(', ')}`)
      args.layer = value
      i += 1
    } else if (flag === '--repeats') {
      args.repeats = positive(value, '--repeats')
      i += 1
    } else if (flag === '--model') {
      args.model = required(value, '--model')
      i += 1
    } else if (flag === '--timeout') {
      args.timeoutMs = positive(value, '--timeout')
      i += 1
    } else if (flag === '--out') {
      args.out = required(value, '--out')
      i += 1
    } else if (flag === '--only') {
      args.only.push(required(value, '--only'))
      i += 1
    } else if (flag === '--dry-run') args.dryRun = true
    else throw new Error(`Unknown flag ${flag}`)
  }
  return args
}

const required = (value, flag) => {
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

const positive = (value, flag) => {
  const parsed = Number(required(value, flag))
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number`)
  return parsed
}

const selected = (entries, only, keyOf) =>
  only.length === 0 ? entries : entries.filter((entry) => only.includes(keyOf(entry)))

const progress = (run) =>
  run.name
    ? `audit ${run.name}: ${run.failure ?? (run.skillLoaded ? 'reported' : 'reported without loading the skill')}`
    : `trigger ${run.id}#${run.attempt} (${run.kind}): ${run.failure ?? (run.loaded ? 'loaded' : 'did not load')}`

function plan(args, triggerCases, cases) {
  const lines = [`model ${args.model}, layer ${args.layer}, repeats ${args.repeats}`]
  if (args.layer !== 'audit') {
    lines.push(`trigger runs (${triggerCases.length * args.repeats}):`)
    lines.push(...triggerCases.map((entry) => `  ${entry.kind} ${entry.id}: ${entry.prompt}`))
  }
  if (args.layer !== 'trigger') {
    lines.push(`audit runs (${cases.length}):`)
    lines.push(...cases.map((entry) => `  ${entry.name}: ${entry.capture}`))
  }
  return `${lines.join('\n')}\n`
}

async function cliVersion() {
  try {
    const { stdout } = await promisify(execFile)(CLAUDE_BIN, ['--version'])
    return stdout.trim()
  } catch {
    return null
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isEntrypoint) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      process.stderr.write(`${error?.message ?? error}\n`)
      process.exitCode = 1
    })
}
