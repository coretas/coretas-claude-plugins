import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { describe, it } from 'node:test'

import { STAGED_NAME, STAGE_ROOT, stageCapture } from '../../eval/stage.mjs'
import { capturePath, findingsPath } from '../helpers/golden.mjs'

const root = () => mkdtemp(join(tmpdir(), 'stage-test-'))

describe('stageCapture', () => {
  it('copies the capture byte for byte', async () => {
    const staged = await stageCapture(capturePath('healthy'), { root: await root() })
    try {
      assert.equal(await readFile(staged.path, 'utf8'), await readFile(capturePath('healthy'), 'utf8'))
    } finally {
      await staged.cleanup()
    }
  })

  // The prompt carries this path to the model, so the name must not say which
  // fixture it is and the directory must not hold the findings answer key.
  it('stages under a neutral name, away from the golden directory', async () => {
    const staged = await stageCapture(capturePath('paused-tag'), { root: await root() })
    try {
      assert.equal(basename(staged.path), STAGED_NAME)
      assert.ok(!staged.path.includes('paused-tag'))
      assert.notEqual(dirname(staged.path), dirname(findingsPath('paused-tag')))
    } finally {
      await staged.cleanup()
    }
  })

  it('gives each staged capture its own directory', async () => {
    const shared = await root()
    const first = await stageCapture(capturePath('healthy'), { root: shared })
    const second = await stageCapture(capturePath('healthy'), { root: shared })
    try {
      assert.notEqual(first.dir, second.dir)
    } finally {
      await first.cleanup()
      await second.cleanup()
    }
  })

  it('cleans up the whole directory, and does not mind being called twice', async () => {
    const staged = await stageCapture(capturePath('healthy'), { root: await root() })
    await staged.cleanup()
    await staged.cleanup()
    await assert.rejects(stat(staged.dir), { code: 'ENOENT' })
  })

  it('defaults to the scratch root the repository reserves for this', () => {
    assert.equal(STAGE_ROOT, join(tmpdir(), 'tracking-doctor'))
  })

  it('fails loudly when the capture is not there', async () => {
    await assert.rejects(stageCapture(capturePath('no-such-fixture'), { root: await root() }), { code: 'ENOENT' })
  })
})
