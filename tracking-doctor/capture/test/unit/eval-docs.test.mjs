import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { TOLERANCES } from '../../eval/tolerances.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..', '..')
const captureRoot = join(here, '..', '..')

const CONTRIBUTING = join(repoRoot, 'CONTRIBUTING.md')
const CAPTURE_README = join(captureRoot, 'README.md')
const RELEASING = join(repoRoot, 'RELEASING.md')
const NIGHTLY_WORKFLOW = join(repoRoot, '.github', 'workflows', 'nightly-eval.yml')

const DOCS = [
  ['CONTRIBUTING.md', CONTRIBUTING],
  ['capture/README.md', CAPTURE_README],
  ['RELEASING.md', RELEASING],
]

describe('eval is release-gated, not a scheduled nightly', () => {
  it('does not claim a nightly in maintainer or release docs', async () => {
    for (const [name, path] of DOCS) {
      const text = await readFile(path, 'utf8')
      assert.doesNotMatch(text, /nightly/i, `${name} still claims a nightly`)
    }
  })

  it('documents npm run eval as the release-gated live-model run', async () => {
    const contributing = await readFile(CONTRIBUTING, 'utf8')
    const captureReadme = await readFile(CAPTURE_README, 'utf8')
    const releasing = await readFile(RELEASING, 'utf8')
    assert.ok(contributing.includes('npm run eval'), 'CONTRIBUTING.md must name npm run eval')
    assert.ok(contributing.includes('release-gated'), 'CONTRIBUTING.md must call the eval release-gated')
    assert.ok(captureReadme.includes('npm run eval'), 'capture/README.md must name npm run eval')
    assert.ok(captureReadme.includes('release-gated'), 'capture/README.md must call the eval release-gated')
    assert.ok(releasing.includes('npm run eval'), 'RELEASING.md must name npm run eval')
  })

  it('does not restore the deleted workflow file', async () => {
    await assert.rejects(() => access(NIGHTLY_WORKFLOW), { code: 'ENOENT' })
  })

  it('keeps the eval harness and its tolerances', () => {
    assert.equal(typeof TOLERANCES, 'object')
    assert.ok(TOLERANCES.maxMissedCriticalDefects === 0)
  })
})
