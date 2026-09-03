import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const MARKETPLACE_PATH = join(REPO_ROOT, '.claude-plugin', 'marketplace.json')
const README_PATH = join(REPO_ROOT, 'README.md')

const REQUIRED_ENTRY_FIELDS = ['name', 'source', 'description', 'author', 'homepage', 'license', 'keywords', 'category']

async function marketplace() {
  return JSON.parse(await readFile(MARKETPLACE_PATH, 'utf8'))
}

async function readme() {
  return readFile(README_PATH, 'utf8')
}

describe('marketplace.json', () => {
  it('lists exactly tracking-doctor and ads-auditor', async () => {
    const { plugins } = await marketplace()
    const names = plugins.map((p) => p.name).sort()
    assert.deepEqual(names, ['ads-auditor', 'tracking-doctor'])
  })

  it('every entry has every required field, non-empty', async () => {
    const { plugins } = await marketplace()
    for (const plugin of plugins) {
      for (const field of REQUIRED_ENTRY_FIELDS) {
        assert.ok(plugin[field], `${plugin.name} is missing "${field}"`)
      }
      assert.ok(plugin.keywords.length > 0, `${plugin.name} has no keywords`)
    }
  })

  it('every entry\'s source resolves to a plugin whose own manifest agrees on the name', async () => {
    const { plugins } = await marketplace()
    for (const plugin of plugins) {
      const manifestPath = join(REPO_ROOT, plugin.source, '.claude-plugin', 'plugin.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      assert.equal(manifest.name, plugin.name, `${plugin.source}'s plugin.json name must match its marketplace entry`)
    }
  })

  it('no entry carries a version field (the documented, deliberate omission)', async () => {
    const { plugins } = await marketplace()
    for (const plugin of plugins) {
      assert.equal(plugin.version, undefined, `${plugin.name} must not declare a version in marketplace.json`)
    }
  })
})

describe('README install docs', () => {
  it('documents adding the community marketplace before installing by name', async () => {
    const text = await readme()
    const addIndex = text.indexOf('claude plugin marketplace add anthropics/claude-plugins-community')
    assert.ok(addIndex >= 0, 'must document adding anthropics/claude-plugins-community')
    const installIndex = text.indexOf('claude plugin install', addIndex)
    assert.ok(installIndex > addIndex, 'the marketplace-add step must come before an install-by-name step')
  })

  it('documents installing each plugin by name', async () => {
    const text = await readme()
    assert.match(text, /claude plugin install tracking-doctor@coretas/)
    assert.match(text, /claude plugin install ads-auditor@coretas/)
  })
})
