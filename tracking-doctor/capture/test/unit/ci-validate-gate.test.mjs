import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

// Resolved relative to this file, not process.cwd() — the workflow sits at the repository root.
const WORKFLOW_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '.github',
  'workflows',
  'validate.yml'
)

async function workflow() {
  return readFile(WORKFLOW_PATH, 'utf8')
}

describe('CI validation gate (.github/workflows/validate.yml)', () => {
  it('runs on every push, not just pull requests', async () => {
    const text = await workflow()
    assert.match(text, /^on:\n(\s+push:\n)(\s+pull_request:\n)?/m)
  })

  it('validates both manifests in strict mode', async () => {
    const text = await workflow()
    assert.match(text, /claude plugin validate \. --strict/)
    assert.match(text, /claude plugin validate \.\/tracking-doctor --strict/)
  })

  it('proves the validator actually fails on a broken manifest, not just that it runs', async () => {
    const text = await workflow()
    // Pins the shape of the negative test: a corrupted copy, a required field removed, and the
    // job failing only if validation *succeeds* against it — an inverted check, easy to get
    // backwards, so the exact condition is asserted rather than just the step's existence.
    assert.match(text, /Prove the gate catches a broken manifest/)
    assert.match(text, /delete j\.name/, 'must strip a required manifest field to trigger the failure')
    assert.match(
      text,
      /if claude plugin validate [^\n]*; then\s*\n\s*echo "::error::[^\n]*"\s*\n\s*exit 1\s*\n\s*fi/,
      'must fail the job when validate unexpectedly succeeds against the broken manifest'
    )
  })
})
