import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { canonicalise, normalise, parseArtefact, stableStringify } from '../../lib/artefact.mjs'
import { capture } from '../../lib/run.mjs'
import { browserAvailable } from '../helpers/browser.mjs'
import { startFixtureServer } from '../helpers/server.mjs'

const FAST = { settleMs: 600, timeoutMs: 20_000 }
const collect = (cap, name) => cap.requests.filter((request) => request.path === `/collect/${name}`)
const events = (cap) =>
  cap.dataLayer.map((entry) => entry.value?.event).filter((event) => typeof event === 'string')

describe('capture against a real browser', { skip: (await browserAvailable()) ? false : 'no browser available' }, () => {
  let server

  before(async () => {
    server = await startFixtureServer()
  })
  after(async () => {
    await server?.close()
  })

  test('captures tracking that only fires after script execution', async () => {
    const cap = normalise(await capture({ url: server.url('/js-heavy.html'), ...FAST }))

    const ga4 = collect(cap, 'g')
    assert.equal(ga4.length, 1, 'the GA4 hit fires from a setTimeout and must be captured')
    assert.equal(ga4[0].params.tid, 'G-JSHEAVY1')
    assert.equal(ga4[0].params.en, 'page_view')

    const meta = collect(cap, 'meta')
    assert.equal(meta.length, 1)
    assert.equal(meta[0].method, 'POST')
    assert.equal(meta[0].body.kind, 'query')
    assert.equal(meta[0].body.params.ev, 'PageView')

    const batch = collect(cap, 'batch')
    assert.equal(batch[0].body.kind, 'query-rows', 'a multi-event beacon must unpack into rows')
    assert.deepEqual(batch[0].body.rows.map((row) => row.en), ['scroll', 'click'])
  })

  test('captures the dataLayer in push order, including gtag arguments', async () => {
    const cap = normalise(await capture({ url: server.url('/js-heavy.html'), ...FAST }))

    assert.deepEqual(events(cap), ['early_event', 'late_event'])
    const [js, config] = cap.dataLayer
    assert.equal(js.value.__type, 'arguments', 'gtag pushes its arguments object, not an array')
    assert.equal(js.value.values[0], 'js')
    assert.deepEqual(config.value.values, ['config', 'G-JSHEAVY1'])

    const late = cap.dataLayer.at(-1)
    assert.equal(late.value.nested.deep.deeper, true, 'nested payloads must survive serialisation')
  })

  test('does not report a request as pre-consent when the consent click caused it', async () => {
    const cap = normalise(await capture({ url: server.url('/consent.html'), ...FAST }))

    const gated = collect(cap, 'g')
    assert.equal(gated.length, 1, 'the consent-gated hit must be captured')
    assert.notEqual(
      gated[0].phase,
      'pre-consent',
      'a hit the accept click caused must not be tagged pre-consent — that inverts the distinction'
    )
    assert.equal(gated[0].phase, 'consent-click')

    const baseline = collect(cap, 'pre')
    assert.equal(baseline[0].phase, 'pre-consent', 'the unconditional hit is genuinely pre-consent')

    assert.equal(cap.consent.matched, 'selector=#onetrust-accept-btn-handler')
    assert.equal(cap.consent.attempted, true)
  })

  test('attributes the consent-granted dataLayer push to the click, not to pre-consent', async () => {
    const cap = normalise(await capture({ url: server.url('/consent.html'), ...FAST }))
    const granted = cap.dataLayer.find((entry) => entry.value?.event === 'consent_granted')
    assert.ok(granted, 'expected the consent_granted push')
    assert.equal(granted.phase, 'consent-click')

    const defaulted = cap.dataLayer.find((entry) => entry.value?.event === 'consent_default')
    assert.equal(defaulted.phase, 'pre-consent')
  })

  test('leaves the banner alone with --consent none, so the gated tag never fires', async () => {
    const cap = normalise(await capture({ url: server.url('/consent.html'), ...FAST, consent: 'none' }))

    assert.equal(collect(cap, 'g').length, 0, 'nothing should accept the banner')
    assert.equal(collect(cap, 'pre')[0].phase, 'no-consent-step')
    assert.equal(cap.consent.action, 'none')
    assert.equal(cap.consent.attempted, false)
  })

  test('reports no-banner rather than post-consent when there was nothing to accept', async () => {
    // Routes matter here: they are what fires after the consent step, so this
    // is the case that catches "post-consent" being asserted unconditionally.
    const cap = normalise(
      await capture({ url: server.url('/spa/index.html'), ...FAST, routes: ['/spa/pricing'] })
    )

    assert.equal(cap.consent.matched, null)
    assert.equal(cap.consent.attempted, false)

    const late = cap.requests.filter((request) => request.phase === 'post-consent')
    assert.equal(late.length, 0, 'consent was never granted, so nothing may claim post-consent')

    const routed = collect(cap, 'spa').filter((hit) => hit.route === '/spa/pricing')
    assert.equal(routed.length, 1)
    assert.equal(routed[0].phase, 'no-banner', 'no CMP was present, so the page is ungated not consented')
  })

  test('attributes SPA route hits to the route that produced them', async () => {
    const cap = normalise(
      await capture({ url: server.url('/spa/index.html'), ...FAST, routes: ['/spa/pricing', '/spa/checkout'] })
    )

    const hits = collect(cap, 'spa')
    assert.deepEqual(
      hits.map((hit) => hit.params.p),
      ['/spa/index.html', '/spa/pricing', '/spa/checkout']
    )
    assert.deepEqual(hits.map((hit) => hit.route), [null, '/spa/pricing', '/spa/checkout'])
    assert.deepEqual(events(cap), ['page_view', 'page_view', 'page_view'])
    assert.deepEqual(
      cap.navigations.filter((entry) => entry.kind === 'route').map((entry) => entry.url),
      ['/spa/pricing', '/spa/checkout']
    )
  })

  test('a page that never goes quiet still yields a partial capture', async () => {
    const cap = normalise(await capture({ url: server.url('/never-settles.html'), settleMs: 600, timeoutMs: 3_000 }))

    assert.equal(cap.run.timedOut, true)
    assert.equal(cap.run.settled, false)
    assert.ok(collect(cap, 'heartbeat').length > 1, 'the beacons before the deadline must survive')
    assert.ok(events(cap).includes('heartbeat_start'))
  })

  test('a live capture round-trips through the artefact and replays identically', async () => {
    const artefact = await capture({ url: server.url('/js-heavy.html'), ...FAST })
    const reparsed = parseArtefact(JSON.stringify(artefact))

    assert.equal(stableStringify(normalise(reparsed)), stableStringify(normalise(artefact)))
  })

  test('canonicalising a live capture leaves no ephemeral port behind', async () => {
    const cap = canonicalise(normalise(await capture({ url: server.url('/js-heavy.html'), ...FAST })))
    const port = new URL(server.origin).port

    assert.ok(!stableStringify(cap).includes(port), `port ${port} leaked into a golden`)
    assert.equal(cap.target.url, 'http://fixture.test/js-heavy.html')
    assert.equal(collect(cap, 'g')[0].params.dl, 'http://fixture.test/js-heavy.html')
  })

  test('a url that does not resolve reports the failure instead of throwing', async () => {
    const artefact = await capture({ url: 'http://127.0.0.1:1/nope', settleMs: 200, timeoutMs: 5_000 })

    assert.equal(artefact.run.loaded, false)
    assert.ok(artefact.errors.some((error) => error.kind === 'navigation-failed'))
  })
})
