import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_MODEL, DEFAULT_TIMEOUT_MS } from '../../eval/claude.mjs'
import { assertSelection, parseArgs } from '../../scripts/run-eval.mjs'

test('parseArgs runs both layers once by default', () => {
  const args = parseArgs([])
  assert.equal(args.layer, 'all')
  assert.equal(args.repeats, 1)
  assert.equal(args.model, DEFAULT_MODEL)
  assert.equal(args.timeoutMs, DEFAULT_TIMEOUT_MS)
  assert.equal(args.dryRun, false)
  assert.deepEqual(args.only, [])
})

test('parseArgs reads the flags the nightly workflow passes', () => {
  const args = parseArgs(['--layer', 'trigger', '--repeats', '3', '--model', 'opus', '--out', '/tmp/e.json'])
  assert.equal(args.layer, 'trigger')
  assert.equal(args.repeats, 3)
  assert.equal(args.model, 'opus')
  assert.equal(args.out, '/tmp/e.json')
})

test('parseArgs collects repeatable --only selectors', () => {
  assert.deepEqual(parseArgs(['--only', 'healthy', '--only', 'paused-tag']).only, ['healthy', 'paused-tag'])
})

test('parseArgs rejects an unknown layer, so a typo cannot silently run everything', () => {
  assert.throws(() => parseArgs(['--layer', 'triger']), /--layer must be one of/)
})

test('parseArgs rejects a flag used as a value', () => {
  assert.throws(() => parseArgs(['--out', '--dry-run']), /--out needs a value/)
  assert.throws(() => parseArgs(['--model']), /--model needs a value/)
})

test('parseArgs rejects a non-positive repeat count', () => {
  assert.throws(() => parseArgs(['--repeats', '0']), /positive number/)
  assert.throws(() => parseArgs(['--repeats', 'many']), /positive number/)
})

test('parseArgs rejects an unknown flag rather than ignoring it', () => {
  assert.throws(() => parseArgs(['--layers', 'trigger']), /Unknown flag --layers/)
})

// 0/0 reads as a perfect score, so a selector that matched nothing has to stop
// the run rather than report a clean sweep over no runs at all.
test('assertSelection refuses a selector that matched nothing in a layer it will run', () => {
  const args = { layer: 'all', only: ['typo'] }
  assert.throws(() => assertSelection(args, [], [{ name: 'healthy' }]), /No trigger prompt matched typo/)
  assert.throws(() => assertSelection(args, [{ id: 'a' }], []), /No audit fixture matched typo/)
})

test('assertSelection ignores the layer that will not run', () => {
  assertSelection({ layer: 'trigger', only: ['check-tracking'] }, [{ id: 'check-tracking' }], [])
  assertSelection({ layer: 'audit', only: ['healthy'] }, [], [{ name: 'healthy' }])
})
