import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  ArtefactError,
  CANONICAL_DATE,
  CANONICAL_ORIGIN,
  SCHEMA_VERSION,
  canonicalise,
  normalise,
  normaliseBody,
  paramsToObject,
  parseArtefact,
  stableStringify,
} from '../../lib/artefact.mjs'
import { FIXTURES } from '../helpers/paths.mjs'

const readFixture = () => readFile(join(FIXTURES, 'artefact-v1.json'), 'utf8')

test('normaliseBody reads a GA4 POST beacon as query params', () => {
  const body = normaliseBody('v=2&tid=G-ABC123&en=page_view')
  assert.equal(body.kind, 'query')
  assert.equal(body.params.tid, 'G-ABC123')
})

test('normaliseBody splits a multi-event beacon into rows', () => {
  const body = normaliseBody('en=scroll&epn.percent=90\nen=click&ep.link_id=cta')
  assert.equal(body.kind, 'query-rows')
  assert.equal(body.rows.length, 2)
  assert.equal(body.rows[0].en, 'scroll')
  assert.equal(body.rows[1]['ep.link_id'], 'cta')
})

test('normaliseBody prefers JSON when the payload is JSON', () => {
  assert.deepEqual(normaliseBody('{"a":1}'), { kind: 'json', value: { a: 1 } })
})

test('normaliseBody falls back to raw for a payload it cannot read', () => {
  assert.deepEqual(normaliseBody('not a query string at all'), {
    kind: 'raw',
    value: 'not a query string at all',
  })
})

test('normaliseBody treats absent and empty payloads as no body', () => {
  assert.equal(normaliseBody(null), null)
  assert.equal(normaliseBody(undefined), null)
  assert.equal(normaliseBody(''), null)
})

test('normaliseBody keeps malformed JSON as raw rather than throwing', () => {
  const body = normaliseBody('{"a":')
  assert.equal(body.kind, 'raw')
})

test('paramsToObject collects repeated keys into an array', () => {
  const params = paramsToObject(new URLSearchParams('a=1&a=2&a=3&b=4'))
  assert.deepEqual(params.a, ['1', '2', '3'])
  assert.equal(params.b, '4')
})

test('stableStringify is insensitive to key insertion order', () => {
  assert.equal(stableStringify({ b: 1, a: { d: 2, c: 3 } }), stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
})

test('parseArtefact rejects a schemaVersion it does not implement', async () => {
  const raw = JSON.parse(await readFixture())
  raw.schemaVersion = SCHEMA_VERSION + 1
  assert.throws(() => parseArtefact(JSON.stringify(raw)), ArtefactError)
})

test('parseArtefact rejects an artefact missing a required field', async () => {
  const raw = JSON.parse(await readFixture())
  delete raw.requests
  assert.throws(() => parseArtefact(JSON.stringify(raw)), /missing required field "requests"/)
})

test('parseArtefact rejects text that is not JSON', () => {
  assert.throws(() => parseArtefact('<html>'), /not valid JSON/)
})

test('normalise is pure: the same artefact yields byte-identical output', async () => {
  const text = await readFixture()
  const once = stableStringify(normalise(parseArtefact(text)))
  const twice = stableStringify(normalise(parseArtefact(text)))
  assert.equal(once, twice)
})

test('normalise splits a request URL into host, path and params', async () => {
  const capture = normalise(parseArtefact(await readFixture()))
  const gtm = capture.requests.find((request) => request.host === 'www.googletagmanager.com')
  assert.ok(gtm, 'expected the gtm.js request in the fixture')
  assert.equal(gtm.path, '/gtm.js')
  assert.equal(gtm.params.id, 'GTM-ABC123')
})

test('canonicalise removes what varies between two runs of one page', async () => {
  const capture = normalise(parseArtefact(await readFixture()))
  const canonical = canonicalise(capture)

  assert.equal(canonical.run.durationMs, 0, 'duration must not leak into a golden')
  assert.equal(canonical.browser.version, undefined, 'browser version must be dropped')
  assert.equal(canonical.options.userAgent, undefined, 'user agent must be dropped')
  for (const request of canonical.requests) assert.equal(request.tMs, 0)
  for (const entry of canonical.dataLayer) assert.equal(entry.tMs, 0)
})

test('canonicalise rewrites the target origin out of urls, hosts and params', () => {
  const canonical = canonicalise({
    target: { url: 'http://127.0.0.1:54321/index.html', finalUrl: 'http://127.0.0.1:54321/index.html' },
    requests: [
      {
        url: 'http://127.0.0.1:54321/collect/g?dl=http%3A%2F%2F127.0.0.1%3A54321%2F',
        host: '127.0.0.1:54321',
        params: { dl: 'http://127.0.0.1:54321/' },
      },
    ],
  })

  assert.equal(canonical.target.url, `${CANONICAL_ORIGIN}/index.html`)
  assert.equal(canonical.requests[0].host, 'fixture.test')
  assert.equal(canonical.requests[0].params.dl, `${CANONICAL_ORIGIN}/`)
  assert.ok(!JSON.stringify(canonical).includes('54321'), 'no ephemeral port may survive')
})

test('canonicalise flattens a Date pushed by gtag', () => {
  const canonical = canonicalise({
    target: { url: 'http://fixture.test/' },
    dataLayer: [{ value: { __type: 'arguments', values: ['js', { __type: 'date', value: '2026-08-20T07:32:20.281Z' }] } }],
  })
  assert.equal(canonical.dataLayer[0].value.values[1].value, CANONICAL_DATE)
})

test('canonicalise leaves a third-party host alone', async () => {
  const canonical = canonicalise(normalise(parseArtefact(await readFixture())))
  assert.ok(canonical.requests.some((request) => request.host === 'www.googletagmanager.com'))
})

test('canonicalise is idempotent', async () => {
  const capture = normalise(parseArtefact(await readFixture()))
  const once = canonicalise(capture)
  assert.equal(stableStringify(canonicalise(once)), stableStringify(once))
})
