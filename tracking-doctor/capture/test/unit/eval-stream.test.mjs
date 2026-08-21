import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { costUsd, finalText, parseEvents, runFailure, skillLoads, toolUses } from '../../eval/stream.mjs'
import { buildStream, resultEvent, skillCall, textBlock, toolUse } from '../helpers/eval-stream.mjs'

const eventsOf = (ndjson) => parseEvents(ndjson).events

describe('stream parsing', () => {
  it('keeps the objects and collects unparseable lines separately', () => {
    const ndjson = ['{"type":"system"}', '', 'not json', '"a string"', '{"type":"result"}'].join('\n')
    const { events, malformed } = parseEvents(ndjson)
    assert.deepEqual(events, [{ type: 'system' }, { type: 'result' }])
    assert.deepEqual(malformed, ['not json', '"a string"'])
  })

  it('survives empty output rather than throwing', () => {
    assert.deepEqual(parseEvents('').events, [])
    assert.deepEqual(parseEvents(undefined).events, [])
  })

  it('reads tool uses out of assistant messages', () => {
    const events = eventsOf(buildStream({ blocks: [textBlock('hi'), toolUse('Bash', { command: 'node x' })] }))
    assert.deepEqual(toolUses(events), [{ name: 'Bash', input: { command: 'node x' } }])
  })
})

describe('skill load detection', () => {
  it('counts a Skill tool call naming the skill', () => {
    const loads = skillLoads(eventsOf(buildStream({ blocks: [skillCall()] })), 'tracking-doctor')
    assert.deepEqual(loads, [{ via: 'skill-tool', tool: 'Skill' }])
  })

  it('counts a plugin-namespaced tool name', () => {
    const events = eventsOf(buildStream({ blocks: [toolUse('mcp__tracking-doctor__audit', {})] }))
    assert.deepEqual(skillLoads(events, 'tracking-doctor'), [
      { via: 'tool-name', tool: 'mcp__tracking-doctor__audit' },
    ])
  })

  it('counts reading SKILL.md, and records that weaker route distinctly', () => {
    const events = eventsOf(
      buildStream({
        blocks: [toolUse('Read', { file_path: '/plugins/tracking-doctor/skills/tracking-doctor/SKILL.md' })],
      })
    )
    assert.deepEqual(skillLoads(events, 'tracking-doctor'), [{ via: 'read-skill-md', tool: 'Read' }])
  })

  it('does not count another skill, or an unrelated file read', () => {
    const events = eventsOf(
      buildStream({
        blocks: [
          toolUse('Skill', { command: '/other-plugin:other' }),
          toolUse('Read', { file_path: '/repo/README.md' }),
        ],
      })
    )
    assert.deepEqual(skillLoads(events, 'tracking-doctor'), [])
  })
})

describe('run outcome', () => {
  it('prefers the result payload for the final text', () => {
    const events = eventsOf(buildStream({ blocks: [textBlock('draft')], result: { result: 'final report' } }))
    assert.equal(finalText(events), 'final report')
  })

  it('falls back to assistant text when the result carries none', () => {
    const events = eventsOf(buildStream({ blocks: [textBlock('only text')], result: { result: '' } }))
    assert.equal(finalText(events), 'only text')
  })

  it('reads the cost, and reports null when absent', () => {
    assert.equal(costUsd(eventsOf(buildStream({ result: { total_cost_usd: 0.25 } }))), 0.25)
    assert.equal(costUsd([resultEvent({ total_cost_usd: undefined })]), null)
  })

  it('calls a run good only when a success result and exit 0 line up', () => {
    const good = eventsOf(buildStream({ blocks: [textBlock('x')] }))
    assert.equal(runFailure(good, { exitCode: 0 }), null)
    assert.match(runFailure(good, { exitCode: 2 }), /exited 2/)
    assert.match(runFailure([{ type: 'system' }]), /no result event/)
    assert.match(runFailure([resultEvent({ is_error: true, subtype: 'error_max_turns' })]), /error_max_turns/)
    assert.match(runFailure([resultEvent({ subtype: 'error_during_execution' })]), /error_during_execution/)
  })
})
