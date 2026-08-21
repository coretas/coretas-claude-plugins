import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { canonicalise, normalise } from '../../lib/artefact.mjs'
import { detect } from '../../lib/detect/index.mjs'
import { FIXTURES } from './paths.mjs'

export const GOLDEN = join(FIXTURES, 'golden')

export const capturePath = (name) => join(GOLDEN, `${name}.capture.json`)
export const findingsPath = (name) => join(GOLDEN, `${name}.findings.json`)
export const fixtureUrlPath = (name) => `/golden/${name}.html`

export async function goldenFixtureNames() {
  const entries = await readdir(GOLDEN)
  return entries
    .filter((entry) => entry.endsWith('.html'))
    .map((entry) => entry.replace(/\.html$/, ''))
    .sort()
}

/**
 * Canonical before detect, always. A live render carries the fixture server's
 * ephemeral port and real millisecond offsets, and both would otherwise reach
 * `target.url` and the duplicate groups' `first_t_ms`/`last_t_ms` — where they
 * make a committed golden unrepeatable.
 */
export function findingsFromArtefact(artefact) {
  return detect(canonicalise(normalise(artefact)))
}

export async function readGolden(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Golden missing: ${path}\nGenerate it with: npm run goldens:update`)
    }
    throw error
  }
}

/**
 * Deep compare reporting every difference by path, rather than the first one.
 * A detection regression usually moves a status and several `observed_values`
 * together, and seeing all of them is what makes the failure diagnosable.
 */
export function diffGolden(actual, expected) {
  const differences = []
  compare(actual, expected, '$', differences)
  return differences
}

function compare(actual, expected, path, out) {
  if (Object.is(actual, expected)) return

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      out.push(`${path}: has ${actual.length} item(s), golden has ${expected.length}`)
    }
    for (let i = 0; i < Math.max(actual.length, expected.length); i += 1) {
      compare(actual[i], expected[i], `${path}[${i}]`, out)
    }
    return
  }

  if (isPlainObject(actual) && isPlainObject(expected)) {
    for (const key of sortedUnion(Object.keys(actual), Object.keys(expected))) {
      if (!(key in actual)) {
        out.push(`${path}.${key}: absent, golden has ${show(expected[key])}`)
        continue
      }
      if (!(key in expected)) {
        out.push(`${path}.${key}: ${show(actual[key])}, absent from golden`)
        continue
      }
      compare(actual[key], expected[key], `${path}.${key}`, out)
    }
    return
  }

  out.push(`${path}: ${show(actual)}, golden has ${show(expected)}`)
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sortedUnion(a, b) {
  return [...new Set([...a, ...b])].sort()
}

function show(value) {
  if (value === undefined) return '(absent)'
  return JSON.stringify(value)
}
