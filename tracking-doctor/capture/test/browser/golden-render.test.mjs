import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { canonicalise, normalise } from '../../lib/artefact.mjs'
import { capture } from '../../lib/run.mjs'
import { browserAvailable } from '../helpers/browser.mjs'
import {
  diffGolden,
  findingsFromArtefact,
  findingsPath,
  fixtureUrlPath,
  goldenFixtureNames,
  readGolden,
} from '../helpers/golden.mjs'
import { startFixtureServer } from '../helpers/server.mjs'
import { createTrackingStub } from '../helpers/tracking-stub.mjs'

const RENDER = { settleMs: 800, timeoutMs: 20_000 }
const REQUIRED = process.env.TRACKING_DOCTOR_REQUIRE_BROWSER === '1'
const available = await browserAvailable()
const names = await goldenFixtureNames()

// A self-skipped golden suite still reports green, which is the one outcome
// worse than a red build: nothing was diffed and nothing said so. CI sets this.
test(
  'a browser is present when TRACKING_DOCTOR_REQUIRE_BROWSER=1',
  { skip: REQUIRED ? false : 'only enforced where CI sets it' },
  () => {
    assert.ok(available, 'no browser found, so no fixture was rendered and this build proved nothing')
  }
)

describe('golden fixtures render to their committed findings', {
  skip: available ? false : 'no browser available',
}, () => {
  let server

  before(async () => {
    server = await startFixtureServer()
  })
  after(async () => {
    await server?.close()
  })

  for (const name of names) {
    test(name, async () => {
      const stub = createTrackingStub({ allowedOrigin: server.origin })
      const artefact = await capture({
        url: server.url(fixtureUrlPath(name)),
        ...RENDER,
        onContext: stub.install,
      })

      assert.equal(artefact.run.loaded, true, 'the fixture did not load')
      assert.equal(artefact.run.timedOut, false, 'the render was cut short, so the capture is partial')
      assert.deepEqual(stub.blocked, [], 'a fixture reached a host the stub does not serve')
      assert.ok(stub.stubbed.length > 0, 'no tracking endpoint was hit — the fixture URLs are wrong')
      assert.deepEqual(
        artefact.requests.filter((request) => request.failure).map((request) => request.url),
        [],
        'a request failed, so the capture records an error rather than the defect'
      )

      // The committed capture is not diffed against this render: it carries
      // browser identity a golden has no business pinning. What must hold is
      // that canonicalising a live render leaves no real host behind, which is
      // the property `canonicalise()` exists for.
      const text = JSON.stringify(canonicalise(normalise(artefact)))
      assert.ok(!text.includes('127.0.0.1'), 'the fixture server host survived canonicalisation')
      assert.ok(!text.includes(new URL(server.origin).port), 'the ephemeral port survived canonicalisation')

      const golden = await readGolden(findingsPath(name))
      const differences = diffGolden(findingsFromArtefact(artefact), golden)
      assert.deepEqual(
        differences,
        [],
        `a live render no longer agrees with ${name}.findings.json:\n${differences.join('\n')}`
      )
    })
  }
})
