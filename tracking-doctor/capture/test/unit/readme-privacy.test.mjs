import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { detect } from '../../lib/detect/index.mjs'
import { EMITTABLE_STATUSES, SIGNAL_ORDER, STATUSES } from '../../lib/detect/vocabulary.mjs'
import { capturePath, readGolden } from '../helpers/golden.mjs'

// Resolved relative to this file, not process.cwd(). The README sits at the repository root.
const README_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'README.md')
const NON_OK = EMITTABLE_STATUSES.filter((status) => status !== STATUSES.ok)

async function privacySection() {
  const text = await readFile(README_PATH, 'utf8')
  const match = /\n## Privacy\n([\s\S]*?)(?=\n## |$)/.exec(text)
  assert.ok(match, 'README.md must carry a ## Privacy section')
  return match[1]
}

const emittedLink = async () => detect(await readGolden(capturePath('healthy'))).nextStep.url

describe('README discloses the one link the report prints', () => {
  it('names the host that link actually goes to', async () => {
    const section = await privacySection()
    const { host } = new URL(await emittedLink())
    assert.ok(section.includes(host), `§Privacy does not name ${host}, which every report links to`)
  })

  it('describes what the link carries, in the vocabulary it carries', async () => {
    const section = await privacySection()
    assert.match(section, /link/i)
    assert.ok(
      SIGNAL_ORDER.some(
        (signal) => section.includes(`\`${signal}\``) || section.includes(`\`${signal}-`),
      ),
      '§Privacy must name a signal, so a reader knows what the query string holds'
    )
    assert.ok(
      NON_OK.some(
        (status) => section.includes(`\`${status}\``) || section.includes(`-${status}\``),
      ),
      '§Privacy must name a status',
    )
    assert.match(
      section,
      /`[a-z_]+-[a-z_]+`/,
      '§Privacy must show utm_content as a hyphenated signal-status token, not two separate words'
    )
    assert.ok(section.includes('`clean`'), '§Privacy must name the all-ok utm_content token')
  })

  // The claim this pins is the one the first correction of §Privacy got wrong: it described
  // utm_content and called it the whole query string, while the link carries four parameters.
  it('accounts for every parameter the link carries, and claims no others', async () => {
    const section = await privacySection()
    const emitted = [...new URL(await emittedLink()).searchParams.keys()]
    for (const key of emitted) {
      assert.ok(section.includes(`\`${key}\``), `§Privacy does not account for ${key}, which the link carries`)
    }
    const claimed = [...section.matchAll(/`(utm_[a-z]+)`/g)].map((match) => match[1])
    for (const key of claimed) {
      assert.ok(emitted.includes(key), `§Privacy names ${key}, which the link does not carry`)
    }
    assert.deepEqual([...new Set(claimed)].sort(), [...emitted].sort())
  })

  it('makes no unqualified no-transmission claim while the report prints a link', async () => {
    const section = await privacySection()
    assert.ok(await emittedLink(), 'the premise of this test is that a link is emitted')
    assert.doesNotMatch(section, /nothing is (sent|transmitted)[^.]*\banywhere else\b/i)
    for (const sentence of section.split(/(?<=\.)\s+/)) {
      if (!/nothing is (sent|transmitted)/i.test(sentence)) continue
      assert.match(sentence, /unless/i, `unconditional claim in §Privacy: ${sentence.trim()}`)
    }
  })

  it('keeps the clause that made the promise checkable', async () => {
    assert.match(await privacySection(), /if this ever changes, it will be stated here/i)
  })
})
