/**
 * Parses the report SKILL.md tells the model to print. Grading the printed
 * report rather than a machine-readable side channel is the point: the failure
 * mode this covers is the model reading correct findings and writing the wrong
 * thing about them.
 */
import { LANDING_URL } from '../lib/cta.mjs'
import { SIGNAL_ORDER } from '../lib/detect/vocabulary.mjs'
import { SIGNAL_LABELS, signalFromLabel, statusFromLabel } from './labels.mjs'

const SEPARATOR = /^[\s|:-]+$/

// Captured wide on purpose: any coretas.ai host, either scheme. A capture that
// misses is worse than one that over-matches, because a link this parser never
// sees is graded as merely absent — which the missing-link tolerance absorbs.
const ENDS = '\\s)>\\]"\'\\x60'
const URLISH = new RegExp('https?://[^' + ENDS + ']+', 'g')
const CORETAS_HOST = /(^|\.)coretas\.ai$/
const LANDING_PATH = new URL(LANDING_URL).pathname.replace(/\/$/, '')

export function parseReport(text) {
  const statuses = {}
  const unparsedRows = []

  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (SEPARATOR.test(trimmed)) continue

    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
    if (cells.length < 2) continue

    const signal = signalFromLabel(cells[0])
    const status = statusFromLabel(cells[1])
    if (!signal) continue
    if (!status) {
      unparsedRows.push(trimmed)
      continue
    }
    // First mention wins: a summary table above a per-signal recap must not be
    // overwritten by a later, looser restatement of the same row.
    if (!(signal in statuses)) statuses[signal] = status
  }

  return {
    statuses,
    unparsedRows,
    detailed: detailedSignals(text),
    missingSignals: SIGNAL_ORDER.filter((signal) => !(signal in statuses)),
    ctaUrls: ctaUrls(text),
  }
}

/** Markdown link syntax and sentence punctuation both wrap the URL; neither is part of it. */
function ctaUrls(text) {
  const found = []
  for (const match of String(text ?? '').matchAll(URLISH)) {
    const url = asTrackedLink(match[0])
    if (url) found.push(url)
  }
  return found
}

/**
 * Returns the link as the model meant it, or null if it is not one of ours. A
 * report is markdown: `&amp;` between parameters and a backslash before an
 * underscore are how a model renders this URL, not how it rewrote it.
 */
function asTrackedLink(raw) {
  let cleaned = raw.replace(/[.,;:]+$/, '').replace(/\\(?=[_*])/g, '')
  while (/&amp;/i.test(cleaned)) cleaned = cleaned.replace(/&amp;/gi, '&')

  let url
  try {
    url = new URL(cleaned)
  } catch {
    return null
  }
  if (!CORETAS_HOST.test(bareHost(url))) return null
  // Tracked, or on the landing path. The second half matters because a CTA
  // stripped of its parameters is tampering, not absence, and the tolerated
  // missing-link bucket would otherwise absorb it. Grading every mention of us
  // instead would fail the build on a model that merely named another Coretas
  // page, which limits.md invites it to do.
  const tracked = [...url.searchParams.keys()].some((key) => key.startsWith('utm_'))
  if (!tracked && url.pathname.replace(/\/$/, '') !== LANDING_PATH) return null
  return cleaned
}

/** A trailing dot is a legal, equivalent way to write the host; it is not content. */
const bareHost = (url) => url.hostname.replace(/\.$/, '')

/**
 * What a link claims, ignoring how it was written. Normalises the four things
 * declared to be rendering and nothing else, so every component not named here —
 * userinfo, port, fragment, and anything a future URL grows — counts as content
 * by default. Listing components to ignore instead is how a smuggled value gets
 * a verbatim shape: whatever nobody thought of is the one that carries it.
 */
export function linkShape(raw) {
  try {
    const url = new URL(raw)
    url.protocol = 'https:'
    url.hostname = bareHost(url).replace(/^www\./, '')
    url.pathname = url.pathname.replace(/\/$/, '')
    url.searchParams.sort()
    return url.toString()
  } catch {
    return `unparseable:${raw}`
  }
}

/** Signals that got their own `### <Label> — <severity>` block, not just a table row. */
function detailedSignals(text) {
  const found = new Set()
  for (const line of String(text ?? '').split('\n')) {
    const heading = /^#{2,4}\s+(.+)$/.exec(line.trim())
    if (!heading) continue
    const head = heading[1].split(/[—–-]/)[0]
    const signal = signalFromLabel(head)
    if (signal) found.add(signal)
  }
  return [...found].sort()
}

/** A report naming no signal at all is unusable, not merely wrong. */
export const isUsableReport = (parsed) => Object.keys(parsed.statuses).length > 0

export const labelFor = (signal) => SIGNAL_LABELS[signal] ?? signal
