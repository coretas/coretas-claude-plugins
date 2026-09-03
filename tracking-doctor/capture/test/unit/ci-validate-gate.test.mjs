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

  it('validates every plugin manifest in strict mode', async () => {
    const text = await workflow()
    assert.match(text, /claude plugin validate \. --strict/)
    assert.match(text, /claude plugin validate \.\/tracking-doctor --strict/)
    assert.match(text, /claude plugin validate \.\/ads-auditor --strict/)
  })

  it('proves the validator actually fails on a broken manifest, not just that it runs', async () => {
    const text = await workflow()
    const step = text.split('Prove the gate catches a broken manifest')[1]
    assert.ok(step, 'must have a "Prove the gate catches a broken manifest" step')
    // Pins the shape of the negative test: a corrupted copy, a required field removed, and the
    // job failing only if validation *succeeds* against it — an inverted check, easy to get
    // backwards, so the exact condition is asserted rather than just the step's existence.
    assert.match(step, /delete j\.name/, 'must strip a required manifest field to trigger the failure')
    assert.match(
      step,
      /if claude plugin validate [^\n]*; then\s*\n\s*echo "::error::[^\n]*"\s*\n\s*exit 1\s*\n\s*fi/,
      'must fail the job when validate unexpectedly succeeds against the broken manifest'
    )
  })

  it('proves the broken-manifest gate for every plugin, not just tracking-doctor', async () => {
    const text = await workflow()
    const step = text.split('Prove the gate catches a broken manifest')[1]
    assert.ok(step, 'must have a "Prove the gate catches a broken manifest" step')
    assert.match(step, /tracking-doctor/, 'must prove the gate for tracking-doctor')
    assert.match(step, /ads-auditor/, 'must prove the gate for ads-auditor')
  })
})
