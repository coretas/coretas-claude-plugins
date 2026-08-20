import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_CANDIDATES, NoBrowserError, launchBrowser } from '../../lib/browser.mjs'

const stubBrowser = { version: () => '1.2.3' }

test('an already-installed browser is preferred over a download', () => {
  assert.deepEqual(
    DEFAULT_CANDIDATES.map((candidate) => candidate.label),
    ['chrome', 'msedge', 'chromium']
  )
})

test('launchBrowser returns the first candidate that launches', async () => {
  const tried = []
  const result = await launchBrowser({
    launcher: async ({ channel }) => {
      tried.push(channel)
      if (channel !== undefined) throw new Error(`no ${channel} here`)
      return stubBrowser
    },
  })
  assert.deepEqual(tried, ['chrome', 'msedge', undefined])
  assert.equal(result.channel, 'chromium')
  assert.equal(result.version, '1.2.3')
})

test('launchBrowser stops at the first success', async () => {
  const tried = []
  const result = await launchBrowser({
    launcher: async ({ channel }) => {
      tried.push(channel)
      return stubBrowser
    },
  })
  assert.deepEqual(tried, ['chrome'])
  assert.equal(result.channel, 'chrome')
})

test('launchBrowser reports every attempt when none work', async () => {
  await assert.rejects(
    launchBrowser({ launcher: async ({ channel }) => { throw new Error(`missing ${channel ?? 'chromium'}`) } }),
    (error) => {
      assert.ok(error instanceof NoBrowserError)
      assert.equal(error.attempts.length, 3)
      assert.match(error.message, /Install Google Chrome/)
      assert.match(error.message, /chrome \(missing chrome\)/)
      return true
    }
  )
})

test('launchBrowser honours a custom candidate list', async () => {
  const result = await launchBrowser({
    candidates: [{ channel: 'msedge', label: 'msedge' }],
    launcher: async () => stubBrowser,
  })
  assert.equal(result.channel, 'msedge')
})

test('a missing playwright-core is reported as its own error, not as three dead channels', async () => {
  const { MissingDependencyError } = await import('../../lib/browser.mjs')
  const attempts = []
  await assert.rejects(
    launchBrowser({
      launcher: async ({ channel }) => {
        attempts.push(channel)
        throw new MissingDependencyError(new Error('Cannot find module'))
      },
    }),
    (error) => {
      assert.ok(error instanceof MissingDependencyError)
      assert.match(error.message, /npm install/)
      return true
    }
  )
  assert.deepEqual(attempts, ['chrome'], 'a missing dependency must abort, not try every channel')
})
