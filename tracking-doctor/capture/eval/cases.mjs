/**
 * The audit layer reads the committed golden captures, never a live render. Two
 * reasons: the goldens' expected findings are already the diffed contract, and
 * the fixtures answer for real tracking hosts that only `tracking-stub.mjs`
 * fulfils — a model-driven render would either reach the network or observe six
 * `missing` signals and prove nothing.
 */
import { STATUSES } from '../lib/detect/vocabulary.mjs'
import { capturePath, findingsPath, goldenFixtureNames, readGolden } from '../test/helpers/golden.mjs'
import { isCritical } from './labels.mjs'

export async function auditCases() {
  const names = await goldenFixtureNames()
  return Promise.all(names.map(caseFor))
}

export async function caseFor(name) {
  const { findings } = await readGolden(findingsPath(name))
  const expected = Object.fromEntries(findings.map((finding) => [finding.signal, finding.status]))
  return {
    name,
    capture: capturePath(name),
    expected,
    defects: defectsOf(expected),
    prompt: auditPrompt(capturePath(name)),
  }
}

export function defectsOf(expected) {
  const entries = Object.entries(expected).filter(([, status]) => status !== STATUSES.ok)
  return {
    critical: entries.filter(([, status]) => isCritical(status)).map(([signal]) => signal),
    soft: entries.filter(([, status]) => !isCritical(status)).map(([signal]) => signal),
  }
}

/**
 * Points at the saved capture rather than a URL, which is a documented path in
 * SKILL.md ("re-running the audit on it is free and needs no network") — so the
 * prompt stays a thing a real user would send.
 */
export const auditPrompt = (path) =>
  `I already captured a page for tracking analysis; the capture is saved at ${path}. ` +
  'Audit its tracking from that saved capture and give me the report. ' +
  'Do not render anything and do not reach the network.'
