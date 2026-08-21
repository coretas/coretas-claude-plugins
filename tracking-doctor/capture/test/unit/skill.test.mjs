import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'

// Resolved relative to this file, not process.cwd(), so the suite works from any invocation dir.
const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'tracking-doctor')
const SKILL_PATH = join(SKILL_DIR, 'SKILL.md')
const REFERENCES_DIR = join(SKILL_DIR, 'references')

const SIGNAL_LABELS = {
  ga4_config: 'GA4 configuration',
  meta_pixel: 'Meta Pixel',
  conversion_linker: 'Conversion linker',
  google_ads_conversion: 'Google Ads conversions',
  ga4_event_coverage: 'GA4 event coverage',
  consent_mode: 'Consent mode',
}

const STATUS_HEADINGS = ['not firing', 'inconsistent', 'not present', 'What it cannot tell you']

function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)
  assert.ok(match, 'SKILL.md must start with a --- frontmatter block')
  const [, frontmatterText, body] = match
  const frontmatter = {}
  for (const line of frontmatterText.split('\n')) {
    const kv = /^([a-zA-Z_]+):\s?(.*)$/.exec(line)
    if (kv) frontmatter[kv[1]] = kv[2]
  }
  return { frontmatter, body }
}

describe('SKILL.md', () => {
  it('exists and parses as frontmatter + body', async () => {
    const text = await readFile(SKILL_PATH, 'utf8')
    const { frontmatter, body } = parseFrontmatter(text)
    assert.ok(frontmatter.name)
    assert.ok(frontmatter.description)
    assert.ok(body.trim().length > 0)
  })

  it('has name exactly "tracking-doctor"', async () => {
    const { frontmatter } = parseFrontmatter(await readFile(SKILL_PATH, 'utf8'))
    assert.equal(frontmatter.name, 'tracking-doctor')
  })

  it('has a single-line description between 80 and 220 characters inclusive', async () => {
    const { frontmatter } = parseFrontmatter(await readFile(SKILL_PATH, 'utf8'))
    assert.ok(!frontmatter.description.includes('\n'))
    assert.ok(
      frontmatter.description.length >= 80 && frontmatter.description.length <= 220,
      `description is ${frontmatter.description.length} chars, want 80-220`
    )
  })

  it('description contains no placeholder language', async () => {
    const { frontmatter } = parseFrontmatter(await readFile(SKILL_PATH, 'utf8'))
    const lowered = frontmatter.description.toLowerCase()
    for (const banned of ['placeholder', 'not implemented', 'todo']) {
      assert.ok(!lowered.includes(banned), `description must not contain "${banned}"`)
    }
  })

  it('is at most 4096 bytes total', async () => {
    const { size } = await stat(SKILL_PATH)
    assert.ok(size <= 4096, `SKILL.md is ${size} bytes, want <= 4096`)
  })

  it('has one reference file per signal, exactly matching SIGNAL_ORDER, plus limits.md', async () => {
    const entries = await readdir(REFERENCES_DIR)
    const basenames = entries.filter((name) => name.endsWith('.md')).map((name) => name.replace(/\.md$/, ''))
    const perSignal = basenames.filter((name) => name !== 'limits').sort()
    assert.deepEqual(perSignal, [...SIGNAL_ORDER].sort())
    assert.ok(basenames.includes('limits'))
  })

  it('every reference file is non-empty and at most 8192 bytes', async () => {
    const entries = await readdir(REFERENCES_DIR)
    for (const name of entries) {
      const path = join(REFERENCES_DIR, name)
      const { size } = await stat(path)
      assert.ok(size > 0, `${name} is empty`)
      assert.ok(size <= 8192, `${name} is ${size} bytes, want <= 8192`)
    }
  })

  it('each per-signal reference contains all four status headings', async () => {
    for (const signal of SIGNAL_ORDER) {
      const text = await readFile(join(REFERENCES_DIR, `${signal}.md`), 'utf8')
      for (const heading of STATUS_HEADINGS) {
        assert.ok(text.includes(heading), `${signal}.md is missing heading "${heading}"`)
      }
    }
  })

  it('limits.md has at least seven entries and mentions tag_names and paused', async () => {
    const text = await readFile(join(REFERENCES_DIR, 'limits.md'), 'utf8')
    const numberedEntries = text.match(/^\d+\.\s/gm) ?? []
    assert.ok(numberedEntries.length >= 7, `limits.md has ${numberedEntries.length} numbered entries, want >= 7`)
    assert.ok(text.includes('tag_names'))
    assert.ok(text.includes('paused'))
  })

  it('references ${CLAUDE_PLUGIN_ROOT} and never hardcodes ~/.claude/plugins', async () => {
    const text = await readFile(SKILL_PATH, 'utf8')
    assert.ok(text.includes('${CLAUDE_PLUGIN_ROOT}'))
    assert.ok(!text.includes('~/.claude/plugins'))
  })

  it('names all six human-readable signal labels', async () => {
    const text = await readFile(SKILL_PATH, 'utf8')
    for (const label of Object.values(SIGNAL_LABELS)) {
      assert.ok(text.includes(label), `SKILL.md is missing label "${label}"`)
    }
  })

  it('documents the preflight: mentions npm ci and node --version', async () => {
    const text = await readFile(SKILL_PATH, 'utf8')
    assert.ok(text.includes('npm ci'))
    assert.ok(text.includes('node --version'))
  })

  it('never reports "paused" as an emittable status', async () => {
    const files = [SKILL_PATH, ...SIGNAL_ORDER.map((signal) => join(REFERENCES_DIR, `${signal}.md`))]
    for (const file of files) {
      const text = await readFile(file, 'utf8')
      const occurrences = text.match(/paused/gi) ?? []
      if (occurrences.length === 0) continue
      // It is fine to name "paused" as a plausible real-world cause (e.g. "the tag is paused in
      // the container") — that is not reporting it as a status this plugin returns. What must
      // never happen is `paused` presented as a mapped, emittable status value the way `ok`,
      // `missing`, `mismatched` and `not_firing` are (a "`paused` -> ..." style mapping entry).
      assert.ok(
        !/`paused`\s*(→|->)/.test(text),
        `${file} maps "paused" to a label as if it were an emittable status`
      )
      // And the file must point the reader to the actual explanation somewhere.
      assert.ok(
        /never emit|does not emit|cannot.*emit|shared vocabulary|cannot tell|cannot distinguish|limits\.md/i.test(
          text
        ),
        `${file} mentions "paused" without qualifying or pointing to why it is never emitted`
      )
    }
  })
})
