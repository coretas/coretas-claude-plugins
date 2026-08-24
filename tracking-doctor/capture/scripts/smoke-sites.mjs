#!/usr/bin/env node
/**
 * Runs the curated real-site list through a full model-driven audit, browser and
 * network included. Manual, before a release — never in the push suite: it
 * reaches third-party sites whose tags change without notice.
 *
 *   node scripts/smoke-sites.mjs
 *   node scripts/smoke-sites.mjs --only https://coretas.ai
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { SIGNAL_ORDER } from '../lib/detect/vocabulary.mjs'
import { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, SKILL_NAME, TOOL_SETS, runClaude } from '../eval/claude.mjs'
import { parseReport } from '../eval/report.mjs'
import { costUsd, finalText, runFailure, skillLoads } from '../eval/stream.mjs'
import { BUDGET_USD } from '../eval/tolerances.mjs'

const SITES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'eval', 'sites.json')

export const sitePrompt = (url) => `audit the tracking on ${url} and give me the report`

export function gradeSite(site, { parsed, skillLoaded, failure }) {
  const problems = []
  if (failure) return [`run did not complete: ${failure}`]
  if (!skillLoaded) problems.push('report produced without loading the skill')
  if (parsed.missingSignals.length > 0) {
    problems.push(`report omitted ${parsed.missingSignals.join(', ')}`)
  }
  for (const [signal, expected] of Object.entries(site.expect ?? {})) {
    const reported = parsed.statuses[signal]
    if (reported !== expected) problems.push(`${signal}: expected ${expected}, reported ${reported ?? 'nothing'}`)
  }
  return problems
}

async function main(argv) {
  // Unknown flags are rejected, not dropped: this script spends real money on
  // real sites, and `--dry-run` silently ignored would be the worst way to learn
  // that it has no dry run.
  const unknown = argv.filter((arg) => arg.startsWith('--'))
  if (unknown.length > 0) throw new Error(`Unknown flag ${unknown[0]}; pass URLs only`)
  const only = argv
  const { sites } = JSON.parse(await readFile(SITES_PATH, 'utf8'))
  const selected = only.length === 0 ? sites : sites.filter((site) => only.includes(site.url))
  if (selected.length === 0) throw new Error(`No site matched ${only.join(', ')}`)

  let failed = 0
  let cost = 0

  for (const site of selected) {
    const result = await runClaude({
      prompt: sitePrompt(site.url),
      tools: [...TOOL_SETS.audit],
      model: DEFAULT_MODEL,
      maxBudgetUsd: BUDGET_USD.smoke,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    })
    const parsed = parseReport(finalText(result.events))
    const problems = gradeSite(site, {
      parsed,
      skillLoaded: skillLoads(result.events, SKILL_NAME).length > 0,
      failure: result.timedOut ? 'claude timed out' : runFailure(result.events, { exitCode: result.exitCode }),
    })
    cost += costUsd(result.events) ?? 0

    const statuses = SIGNAL_ORDER.map((signal) => `${signal}=${parsed.statuses[signal] ?? '?'}`).join(' ')
    process.stdout.write(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${site.url}\n  ${statuses}\n`)
    for (const problem of problems) process.stdout.write(`  - ${problem}\n`)
    if (problems.length > 0) failed += 1
  }

  process.stdout.write(`\n${selected.length - failed}/${selected.length} site(s) clean · $${cost.toFixed(4)}\n`)
  return failed === 0 ? 0 : 1
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
