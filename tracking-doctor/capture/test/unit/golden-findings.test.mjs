import assert from 'node:assert/strict'
import { test } from 'node:test'

import { detect } from '../../lib/detect/index.mjs'
import { stableStringify } from '../../lib/artefact.mjs'
import { capturePath, diffGolden, findingsPath, goldenFixtureNames, readGolden } from '../helpers/golden.mjs'

const names = await goldenFixtureNames()

test('there is at least one golden fixture', () => {
  assert.ok(names.length > 0)
})

for (const name of names) {
  test(`${name}: the committed capture still detects to the committed findings`, async () => {
    const capture = await readGolden(capturePath(name))
    const golden = await readGolden(findingsPath(name))

    const differences = diffGolden(detect(capture), golden)
    assert.deepEqual(
      differences,
      [],
      `detection no longer agrees with ${name}.findings.json:\n${differences.join('\n')}`
    )
  })

  test(`${name}: detection over the committed capture is byte-stable`, async () => {
    const capture = await readGolden(capturePath(name))
    assert.equal(stableStringify(detect(capture)), stableStringify(detect(capture)))
  })

  test(`${name}: the committed capture is already canonical`, async () => {
    const capture = await readGolden(capturePath(name))
    const text = stableStringify(capture)

    assert.ok(!/127\.0\.0\.1/.test(text), 'a fixture server origin leaked into the golden')
    assert.ok(!/"tMs": [1-9]/.test(text), 'a real timing leaked into the golden')
    assert.equal(capture.run.startedAt, undefined, 'a canonical capture carries no wall-clock start')
  })
}
