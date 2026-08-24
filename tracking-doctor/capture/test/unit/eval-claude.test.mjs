import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { describe, it } from 'node:test'

import { PLUGIN_DIR, TOOL_SETS, buildArgs, runClaude } from '../../eval/claude.mjs'
import { buildStream, textBlock } from '../helpers/eval-stream.mjs'

const argsOf = (overrides = {}) => buildArgs({ prompt: 'check my tracking', tools: ['Skill'], ...overrides })

const valueAfter = (args, flag) => args[args.indexOf(flag) + 1]

function fakeSpawn(stdout, { exitCode = 0, stderr = '', hang = false } = {}) {
  const calls = []
  const spawn = (bin, args, options) => {
    calls.push({ bin, args, options })
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {
      child.emit('close', null)
    }
    if (!hang) {
      setImmediate(() => {
        if (stdout) child.stdout.emit('data', stdout)
        if (stderr) child.stderr.emit('data', stderr)
        child.emit('close', exitCode)
      })
    }
    return child
  }
  return { spawn, calls }
}

describe('buildArgs', () => {
  it('loads the plugin for the session only, never from installed settings', () => {
    const args = argsOf()
    assert.equal(valueAfter(args, '--plugin-dir'), PLUGIN_DIR)
    assert.match(PLUGIN_DIR, /tracking-doctor$/)
    assert.ok(!args.includes('--settings'))
  })

  it('asks for the stream so tool calls are observable, not just the text', () => {
    const args = argsOf()
    assert.equal(valueAfter(args, '--output-format'), 'stream-json')
    assert.ok(args.includes('--verbose'))
    assert.ok(args.includes('-p'))
  })

  it('leaves no session behind and pins the model', () => {
    const args = argsOf({ model: 'sonnet' })
    assert.ok(args.includes('--no-session-persistence'))
    assert.equal(valueAfter(args, '--model'), 'sonnet')
  })

  it('passes a spend ceiling when given one, and omits the flag otherwise', () => {
    assert.equal(valueAfter(argsOf({ maxBudgetUsd: 0.5 }), '--max-budget-usd'), '0.5')
    assert.ok(!argsOf().includes('--max-budget-usd'))
  })

  it('joins the tool list into the single value the CLI expects', () => {
    assert.equal(valueAfter(argsOf({ tools: ['Skill', 'Bash'] }), '--tools'), 'Skill,Bash')
  })

  // A trigger run must not be able to render a page: the question is whether the
  // skill loads, and a shell turns a one-call check into a full audit.
  it('gives the trigger layer the Skill tool and nothing else', () => {
    assert.deepEqual([...TOOL_SETS.trigger], ['Skill'])
    assert.ok(TOOL_SETS.audit.includes('Bash'))
  })

  it('refuses to build a run with no prompt or no tools', () => {
    assert.throws(() => buildArgs({ tools: ['Skill'] }), /needs a prompt/)
    assert.throws(() => buildArgs({ prompt: 'x', tools: [] }), /needs a tool list/)
  })
})

describe('runClaude', () => {
  it('spawns the binary with the built args and returns the parsed stream', async () => {
    const stream = buildStream({ blocks: [textBlock('done')], result: { result: 'report' } })
    const { spawn, calls } = fakeSpawn(stream)
    const result = await runClaude({ prompt: 'p', tools: ['Skill'] }, { spawn, bin: 'claude-test' })

    assert.equal(calls[0].bin, 'claude-test')
    assert.deepEqual(calls[0].args, result.args)
    assert.equal(result.exitCode, 0)
    assert.equal(result.timedOut, false)
    assert.equal(result.events.at(-1).result, 'report')
  })

  it('keeps a non-zero exit and stderr rather than throwing', async () => {
    const { spawn } = fakeSpawn('{"type":"system"}', { exitCode: 1, stderr: 'Invalid API key' })
    const result = await runClaude({ prompt: 'p', tools: ['Skill'] }, { spawn })
    assert.equal(result.exitCode, 1)
    assert.match(result.stderr, /Invalid API key/)
  })

  it('kills a hung run and says so, instead of stalling the nightly', async () => {
    const { spawn } = fakeSpawn('', { hang: true })
    const result = await runClaude({ prompt: 'p', tools: ['Skill'], timeoutMs: 20 }, { spawn })
    assert.equal(result.timedOut, true)
    assert.deepEqual(result.events, [])
  })

  it('surfaces a spawn failure as an error', async () => {
    const spawn = () => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      setImmediate(() => child.emit('error', new Error('ENOENT claude')))
      return child
    }
    await assert.rejects(runClaude({ prompt: 'p', tools: ['Skill'] }, { spawn }), /ENOENT claude/)
  })
})
