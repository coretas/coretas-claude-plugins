/**
 * Copies a golden capture into a scratch directory under a neutral name before an
 * audit run. The goldens sit next to `<name>.findings.json` — the grading answer
 * key — and the audit layer has Read and Glob, so pointing the prompt straight at
 * the fixture directory lets a model transcribe the answer instead of deriving it.
 */
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const STAGE_ROOT = join(tmpdir(), 'tracking-doctor')
export const STAGED_NAME = 'capture.json'

export async function stageCapture(source, deps = {}) {
  const root = deps.root ?? STAGE_ROOT
  await mkdir(root, { recursive: true })
  const dir = await mkdtemp(join(root, 'eval-'))
  const path = join(dir, STAGED_NAME)
  await copyFile(source, path)
  return { dir, path, cleanup: () => rm(dir, { recursive: true, force: true }) }
}
