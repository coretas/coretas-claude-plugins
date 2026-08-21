import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseArgs } from '../../capture.mjs'

test('parseArgs collects repeatable options', () => {
  const args = parseArgs(['https://example.test', '--route', '/a', '--route', '/b', '--datalayer-name', 'digitalData'])
  assert.deepEqual(args.positional, ['https://example.test'])
  assert.deepEqual(args.routes, ['/a', '/b'])
  assert.deepEqual(args.dataLayerNames, ['digitalData'])
})

test('parseArgs reads the boolean flags', () => {
  const args = parseArgs(['--raw', '--canonical', '--headed'])
  assert.equal(args.raw, true)
  assert.equal(args.canonical, true)
  assert.equal(args.headed, true)
})

test('parseArgs defaults the boolean flags to false', () => {
  const args = parseArgs([])
  assert.equal(args.raw, false)
  assert.equal(args.canonical, false)
  assert.equal(args.headed, false)
})

test('parseArgs parses a viewport', () => {
  assert.deepEqual(parseArgs(['--viewport', '800x600']).viewport, { width: 800, height: 600 })
})

test('parseArgs rejects a malformed viewport', () => {
  assert.throws(() => parseArgs(['--viewport', '800']), /must look like/)
})

test('parseArgs rejects a non-positive timeout', () => {
  assert.throws(() => parseArgs(['--timeout', '0']), /positive integer/)
  assert.throws(() => parseArgs(['--timeout', 'soon']), /positive integer/)
})

test('parseArgs rejects an unknown consent mode', () => {
  assert.throws(() => parseArgs(['--consent', 'maybe']), /"accept" or "none"/)
  assert.equal(parseArgs(['--consent', 'none']).consent, 'none')
})

test('parseArgs rejects an unknown option rather than treating it as a url', () => {
  assert.throws(() => parseArgs(['--nope']), /Unknown option --nope/)
})

test('parseArgs rejects a flag whose value is the next flag', () => {
  assert.throws(() => parseArgs(['--out', '--raw']), /--out requires a value/)
})

test('parseArgs rejects a trailing flag with no value', () => {
  assert.throws(() => parseArgs(['--timeout']), /--timeout requires a value/)
})
