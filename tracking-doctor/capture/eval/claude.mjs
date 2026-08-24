/**
 * Spawns `claude -p` and returns the parsed stream. The plugin is loaded with
 * `--plugin-dir`, which is session-scoped: a nightly run must not write to
 * anyone's real plugin settings, and an install-based harness would test the
 * installer as much as the skill.
 */
import { spawn as nodeSpawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseEvents } from './stream.mjs'

export const SKILL_NAME = 'tracking-doctor'
export const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CLAUDE_BIN = process.env.TRACKING_DOCTOR_CLAUDE_BIN ?? 'claude'
export const DEFAULT_MODEL = process.env.TRACKING_DOCTOR_EVAL_MODEL ?? 'sonnet'
export const DEFAULT_TIMEOUT_MS = 240_000

/**
 * Trigger runs get the `Skill` tool and nothing else: the question is whether the
 * skill loads, and a shell would let a run spend minutes rendering a page to
 * answer it. Audit runs need a shell, because the skill's own instructions are to
 * run the CLI.
 */
export const TOOL_SETS = Object.freeze({
  trigger: Object.freeze(['Skill']),
  audit: Object.freeze(['Skill', 'Bash', 'Read', 'Glob', 'Grep']),
})

export function buildArgs({ prompt, pluginDir = PLUGIN_DIR, tools, model = DEFAULT_MODEL, maxBudgetUsd }) {
  if (!prompt) throw new Error('buildArgs needs a prompt')
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('buildArgs needs a tool list')

  const args = [
    '-p',
    prompt,
    '--plugin-dir',
    pluginDir,
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    model,
    '--tools',
    tools.join(','),
    '--permission-mode',
    'bypassPermissions',
    '--no-session-persistence',
  ]
  if (typeof maxBudgetUsd === 'number') args.push('--max-budget-usd', String(maxBudgetUsd))
  return args
}

export async function runClaude(options, deps = {}) {
  const spawn = deps.spawn ?? nodeSpawn
  const bin = deps.bin ?? CLAUDE_BIN
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const args = buildArgs(options)

  const { exitCode, stdout, stderr, timedOut } = await collect(spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] }), timeoutMs)
  const { events, malformed } = parseEvents(stdout)

  return { args, exitCode, stdout, stderr, timedOut, events, malformed }
}

function collect(child, timeoutMs) {
  return new Promise((settle, reject) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    // Decode as UTF-8 at the stream, not by concatenating Buffers: the report
    // format mandates em dashes, and one split across a chunk boundary would
    // corrupt that NDJSON line and cost the run.
    child.stdout?.setEncoding?.('utf8')
    child.stderr?.setEncoding?.('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      settle({ exitCode: code ?? 0, stdout, stderr, timedOut })
    })
  })
}
