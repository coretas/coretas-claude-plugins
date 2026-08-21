import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import { detect } from '../../lib/detect/index.mjs'
import { diffGolden } from '../helpers/golden.mjs'
import { FIXTURES } from '../helpers/paths.mjs'

/**
 * The acceptance criterion this file exists for: a deliberate regression in a
 * detection rule must fail the build. Each case below is a mutation a real rule
 * regression would produce, applied to genuine `detect()` output — so the proof
 * needs no browser and no committed golden.
 */
const readCapture = async (name) =>
  JSON.parse(await readFile(join(FIXTURES, 'captures', `${name}.json`), 'utf8'))

const baseline = detect(await readCapture('present-never-fires'))
const clone = () => structuredClone(baseline)

// Mutations must differ from whatever the rules currently say, or a rule change
// makes a mutation a no-op and this file fails for a reason it does not test.
const flip = (status) => (status === 'ok' ? 'not_firing' : 'ok')

test('identical output reports no differences', () => {
  assert.deepEqual(diffGolden(clone(), baseline), [])
})

test('key order is not a difference', () => {
  const reordered = structuredClone(baseline)
  reordered.findings = reordered.findings.map((finding) =>
    Object.fromEntries(Object.entries(finding).reverse())
  )
  assert.deepEqual(diffGolden(reordered, baseline), [])
})

test('a rule that stops detecting is caught, and the path names the signal', () => {
  const regressed = clone()
  const was = regressed.findings[0].status
  regressed.findings[0].status = flip(was)

  const differences = diffGolden(regressed, baseline)
  assert.deepEqual(differences, [`$.findings[0].status: "${flip(was)}", golden has "${was}"`])
})

test('a wrong count inside observed_values is caught', () => {
  const regressed = clone()
  regressed.findings[0].observed_values.hit_count = 1

  const differences = diffGolden(regressed, baseline)
  assert.deepEqual(differences, ['$.findings[0].observed_values.hit_count: 1, golden has 0'])
})

test('a reworded detail is caught', () => {
  const regressed = clone()
  regressed.findings[1].detail = 'Something else entirely.'

  assert.equal(diffGolden(regressed, baseline).length, 1)
})

test('a spurious extra id is caught, with its index', () => {
  const regressed = clone()
  regressed.findings[0].observed_values.measurement_ids_declared.push('G-PHANTOM')

  const differences = diffGolden(regressed, baseline)
  assert.ok(
    differences.some((line) => line.includes('measurement_ids_declared: has 2 item(s), golden has 1')),
    differences.join('\n')
  )
  assert.ok(differences.some((line) => line.includes('measurement_ids_declared[1]')))
})

test('a dropped id is caught', () => {
  const regressed = clone()
  regressed.findings[0].observed_values.measurement_ids_declared = []

  assert.ok(diffGolden(regressed, baseline).length > 0)
})

test('reordered findings are caught: signal order is part of the contract', () => {
  const regressed = clone()
  ;[regressed.findings[0], regressed.findings[1]] = [regressed.findings[1], regressed.findings[0]]

  assert.ok(diffGolden(regressed, baseline).length > 0)
})

test('a dropped finding is caught', () => {
  const regressed = clone()
  regressed.findings.pop()

  const differences = diffGolden(regressed, baseline)
  assert.ok(differences.some((line) => line.includes('has 5 item(s), golden has 6')))
})

test('a removed observed_values key is caught as absent, not silently equal', () => {
  const regressed = clone()
  delete regressed.findings[0].observed_values.failed_hit_count

  const differences = diffGolden(regressed, baseline)
  assert.deepEqual(differences, ['$.findings[0].observed_values.failed_hit_count: absent, golden has 0'])
})

test('a new observed_values key is caught, so an unreviewed field cannot slip in', () => {
  const regressed = clone()
  regressed.findings[0].observed_values.brand_new_field = true

  const differences = diffGolden(regressed, baseline)
  assert.deepEqual(differences, ['$.findings[0].observed_values.brand_new_field: true, absent from golden'])
})

test('every difference is reported, not just the first', () => {
  const regressed = clone()
  for (const index of [0, 1, 2]) {
    regressed.findings[index].status = flip(regressed.findings[index].status)
  }

  assert.equal(diffGolden(regressed, baseline).length, 3)
})

test('null and 0 are not confused', () => {
  assert.deepEqual(diffGolden({ a: null }, { a: 0 }), ['$.a: null, golden has 0'])
  assert.deepEqual(diffGolden({ a: 0 }, { a: null }), ['$.a: 0, golden has null'])
})
