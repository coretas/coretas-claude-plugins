#!/usr/bin/env node
/**
 * Regenerates every golden from a real render. Needs a browser; everything that
 * reads the goldens afterwards does not.
 *
 * Writes two files per fixture:
 *   <name>.capture.json   canonical normalised capture — the offline input
 *   <name>.findings.json  what detection makes of it — the diffed contract
 *
 * Blessing whatever comes out is the failure mode here, so this only writes
 * files; `test/unit/golden-intent.test.mjs` is what decides whether each fixture
 * actually produced the defect it was written to produce.
 */
import { writeFile } from 'node:fs/promises'

import { canonicalise, normalise, stableStringify } from '../lib/artefact.mjs'
import { detect } from '../lib/detect/index.mjs'
import { capture } from '../lib/run.mjs'
import { capturePath, findingsPath, fixtureUrlPath, goldenFixtureNames } from '../test/helpers/golden.mjs'
import { startFixtureServer } from '../test/helpers/server.mjs'
import { createTrackingStub } from '../test/helpers/tracking-stub.mjs'

const SETTLE_MS = 800
const TIMEOUT_MS = 20_000

async function main() {
  const names = await goldenFixtureNames()
  if (names.length === 0) throw new Error('No golden fixtures found')

  const server = await startFixtureServer()
  try {
    for (const name of names) {
      const stub = createTrackingStub({ allowedOrigin: server.origin })
      const artefact = await capture({
        url: server.url(fixtureUrlPath(name)),
        settleMs: SETTLE_MS,
        timeoutMs: TIMEOUT_MS,
        onContext: stub.install,
      })

      assertUsable(name, artefact, stub)

      const shaped = canonicalise(normalise(artefact))
      await writeFile(capturePath(name), `${stableStringify(shaped)}\n`, 'utf8')
      await writeFile(findingsPath(name), `${stableStringify(detect(shaped))}\n`, 'utf8')

      const statuses = detect(shaped).findings.map((finding) => `${finding.signal}=${finding.status}`)
      process.stdout.write(`${name}\n  ${statuses.join(' ')}\n`)
    }
  } finally {
    await server.close()
  }

  process.stdout.write(`\n${names.length} fixture(s) written. Now run: npm run test:pure\n`)
}

/** A golden built from a broken render would pin the break, not the behaviour. */
function assertUsable(name, artefact, stub) {
  if (!artefact.run.loaded) throw new Error(`${name}: page did not load`)
  if (artefact.run.timedOut) throw new Error(`${name}: capture timed out, so the render is partial`)
  if (stub.blocked.length > 0) {
    throw new Error(`${name}: reached a host the stub does not serve: ${stub.blocked.join(', ')}`)
  }
  const failed = artefact.requests.filter((request) => request.failure)
  if (failed.length > 0) {
    throw new Error(`${name}: ${failed.length} request(s) failed: ${failed.map((r) => r.url).join(', ')}`)
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message ?? error}\n`)
  process.exit(1)
})
