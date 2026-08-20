import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { emit } from '../../capture.mjs'

describe('emit', () => {
  let scratch

  before(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'tracking-doctor-emit-'))
  })

  after(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  it('creates the directory it was pointed at', async () => {
    const target = join(scratch, 'nested', 'deeper', 'run.json')
    await emit(target, { hello: 'world' })
    assert.equal((await stat(target)).isFile(), true)
  })

  it('writes stable, newline-terminated JSON', async () => {
    const target = join(scratch, 'stable.json')
    await emit(target, { b: 2, a: 1 })
    const text = await readFile(target, 'utf8')
    assert.equal(text, '{\n  "a": 1,\n  "b": 2\n}\n')
  })

  it('overwrites an existing file rather than appending', async () => {
    const target = join(scratch, 'twice.json')
    await emit(target, { run: 1 })
    await emit(target, { run: 2 })
    assert.equal(JSON.parse(await readFile(target, 'utf8')).run, 2)
  })

  it('leaves a bare filename in the working directory alone', async () => {
    // dirname('x.json') is '.', which must not be handed to mkdir.
    const cwd = process.cwd()
    try {
      process.chdir(scratch)
      await emit('bare.json', { ok: true })
      assert.equal((await stat(join(scratch, 'bare.json'))).isFile(), true)
    } finally {
      process.chdir(cwd)
    }
  })
})
