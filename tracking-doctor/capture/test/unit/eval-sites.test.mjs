import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { EMITTABLE_STATUSES, SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'
import { parseReport } from '../../eval/report.mjs'
import { gradeSite, sitePrompt } from '../../scripts/smoke-sites.mjs'
import { reportText } from '../helpers/eval-stream.mjs'

const SITES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'eval', 'sites.json')

const load = async () => JSON.parse(await readFile(SITES_PATH, 'utf8'))

const clean = () => ({ parsed: parseReport(reportText()), skillLoaded: true, failure: null })

describe('smoke site list', () => {
  it('is https, unique, and every entry says why it is on the list', async () => {
    const { sites } = await load()
    assert.ok(sites.length >= 2)
    assert.equal(new Set(sites.map((site) => site.url)).size, sites.length)
    for (const site of sites) {
      assert.match(site.url, /^https:\/\//)
      assert.ok(site.why && site.why.length > 20, `${site.url} has no reason to be here`)
    }
  })

  it('pins statuses only in the shared vocabulary, and only per signal', async () => {
    const { sites } = await load()
    for (const site of sites) {
      for (const [signal, status] of Object.entries(site.expect ?? {})) {
        assert.ok(SIGNAL_ORDER.includes(signal), `${site.url} pins unknown signal ${signal}`)
        assert.ok(EMITTABLE_STATUSES.includes(status), `${site.url} pins non-emittable ${status}`)
      }
    }
  })

  // A third-party page can add a tag any day, and a smoke run that goes red for
  // that reason is a smoke run people learn to ignore.
  it('pins statuses on at most one site', async () => {
    const { sites } = await load()
    const pinned = sites.filter((site) => Object.keys(site.expect ?? {}).length > 0)
    assert.equal(pinned.length, 1)
    assert.equal(pinned[0].url, 'https://example.com')
    assert.deepEqual(Object.keys(pinned[0].expect).sort(), [...SIGNAL_ORDER].sort())
  })

  it('asks in the words a user would use, naming nothing internal', async () => {
    const { sites } = await load()
    const prompt = sitePrompt(sites[0].url)
    assert.ok(prompt.includes(sites[0].url))
    assert.ok(!prompt.toLowerCase().includes('skill'))
  })
})

describe('smoke grading', () => {
  it('passes a well-formed report on an unpinned site', () => {
    assert.deepEqual(gradeSite({ url: 'https://coretas.ai', expect: {} }, clean()), [])
  })

  it('fails a pinned status the page did not produce', () => {
    const site = { url: 'https://example.com', expect: { ga4_config: 'missing' } }
    assert.deepEqual(gradeSite(site, clean()), ['ga4_config: expected missing, reported ok'])
  })

  it('fails a report that omitted signals, naming them', () => {
    const partial = { parsed: parseReport('| Consent mode | working |'), skillLoaded: true, failure: null }
    const problems = gradeSite({ url: 'https://coretas.ai' }, partial)
    assert.equal(problems.length, 1)
    assert.match(problems[0], /report omitted ga4_config/)
  })

  it('fails a report produced without the skill', () => {
    const problems = gradeSite({ url: 'https://coretas.ai' }, { ...clean(), skillLoaded: false })
    assert.deepEqual(problems, ['report produced without loading the skill'])
  })

  it('reports a failed run once, without also grading its empty report', () => {
    const site = { url: 'https://example.com', expect: { ga4_config: 'missing' } }
    const problems = gradeSite(site, { parsed: parseReport(''), skillLoaded: false, failure: 'claude exited 1' })
    assert.deepEqual(problems, ['run did not complete: claude exited 1'])
  })
})
