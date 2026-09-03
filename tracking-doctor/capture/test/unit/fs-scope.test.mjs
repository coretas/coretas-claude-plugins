import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

// The runtime path SKILL.md actually invokes: capture.mjs (package.json's `bin` entry) plus
// everything it imports from lib/. eval/ and scripts/ are maintainer-only tooling, never run by
// the skill, so they are deliberately out of scope here.
const CAPTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LIB_DIR = join(CAPTURE_DIR, 'lib')

async function mjsFilesUnder(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await mjsFilesUnder(path)))
    else if (entry.name.endsWith('.mjs')) found.push(path)
  }
  return found
}

describe('filesystem access stays inside capture.mjs', () => {
  it('is the only runtime file importing node:fs', async () => {
    const runtimeFiles = [join(CAPTURE_DIR, 'capture.mjs'), ...(await mjsFilesUnder(LIB_DIR))]
    const withFsImport = []
    for (const file of runtimeFiles) {
      const text = await readFile(file, 'utf8')
      if (/from ['"]node:fs/.test(text) || /require\(['"]fs['"]\)/.test(text)) withFsImport.push(file)
    }
    assert.deepEqual(
      withFsImport.map((file) => file.slice(CAPTURE_DIR.length + 1)),
      ['capture.mjs'],
      'a lib/** file gained filesystem access — the plugin must touch nothing outside its own ' +
        'directory except through the audited capture.mjs read/write paths'
    )
  })
})
