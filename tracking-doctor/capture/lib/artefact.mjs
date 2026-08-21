/**
 * Capture artefact: the raw record of a render, and the pure normalisation that
 * turns it into the shape detection reads.
 *
 * This module deliberately imports nothing from playwright. Normalising an
 * artefact is a pure function of its contents, which is what lets detection and
 * the golden fixture suite run offline and deterministically.
 */

export const SCHEMA_VERSION = 1

/**
 * Every request and dataLayer entry carries one of these. Detection branches on
 * them, so they are part of the artefact contract, not an internal label.
 *
 * - `pre-consent`      before the consent step ran, or a click was attempted and
 *                      threw, so nothing was granted
 * - `consent-click`    caused by the accept click itself — a tag here is gated
 *                      on consent rather than firing unconditionally
 * - `post-consent`     after consent was successfully granted
 * - `no-banner`        the consent step ran and found no banner to accept; the
 *                      page is unGated, NOT consented
 * - `no-consent-step`  captured with `--consent none`; consent was never touched
 */
export const PHASES = Object.freeze({
  preConsent: 'pre-consent',
  consentClick: 'consent-click',
  postConsent: 'post-consent',
  noBanner: 'no-banner',
  noConsentStep: 'no-consent-step',
})

export class ArtefactError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ArtefactError'
  }
}

export function parseArtefact(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (err) {
    throw new ArtefactError(`Artefact is not valid JSON: ${err.message}`)
  }
  if (raw?.schemaVersion !== SCHEMA_VERSION) {
    throw new ArtefactError(
      `Unsupported artefact schemaVersion ${raw?.schemaVersion ?? '(missing)'}; expected ${SCHEMA_VERSION}`
    )
  }
  for (const field of ['target', 'run', 'requests', 'dataLayer']) {
    if (raw[field] === undefined) throw new ArtefactError(`Artefact is missing required field "${field}"`)
  }
  return raw
}

/** Pure: same artefact in, byte-identical normalised capture out. */
export function normalise(artefact) {
  return {
    schemaVersion: SCHEMA_VERSION,
    browser: artefact.browser ?? null,
    target: artefact.target,
    options: artefact.options ?? {},
    run: {
      durationMs: artefact.run.durationMs ?? null,
      timedOut: Boolean(artefact.run.timedOut),
      settled: Boolean(artefact.run.settled),
    },
    consent: artefact.consent ?? { action: 'none', matched: null, attempted: false, tMs: null },
    navigations: artefact.navigations ?? [],
    requests: (artefact.requests ?? []).map(normaliseRequest),
    dataLayer: (artefact.dataLayer ?? []).map((entry) => ({
      source: entry.source,
      index: entry.index,
      phase: entry.phase ?? null,
      route: entry.route ?? null,
      tMs: entry.tMs ?? null,
      value: entry.value ?? null,
    })),
    cookies: artefact.cookies ?? [],
    errors: artefact.errors ?? [],
  }
}

function normaliseRequest(request) {
  const url = safeUrl(request.url)
  return {
    tMs: request.tMs ?? null,
    phase: request.phase ?? null,
    route: request.route ?? null,
    method: request.method ?? 'GET',
    resourceType: request.resourceType ?? null,
    host: url?.host ?? null,
    path: url?.pathname ?? null,
    url: request.url,
    params: url ? paramsToObject(url.searchParams) : {},
    body: normaliseBody(request.postData ?? null),
    status: request.status ?? null,
    failure: request.failure ?? null,
    frameUrl: request.frameUrl ?? null,
  }
}

/**
 * GA4 and Meta both post payloads that are query strings, sometimes several
 * newline-separated events in one beacon. Unpacking them here means detection
 * never has to care whether a hit arrived as GET params or a POST body.
 */
export function normaliseBody(postData) {
  if (postData === null || postData === undefined || postData === '') return null
  const text = String(postData)
  const trimmed = text.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { kind: 'json', value: JSON.parse(trimmed) }
    } catch {
      /* fall through to the query-string readings */
    }
  }

  const lines = text.split('\n').filter((line) => line.length > 0)
  if (lines.length > 1 && lines.every(isQueryString)) {
    return {
      kind: 'query-rows',
      rows: lines.map((line) => paramsToObject(new URLSearchParams(line))),
    }
  }
  if (lines.length === 1 && isQueryString(trimmed)) {
    return { kind: 'query', params: paramsToObject(new URLSearchParams(trimmed)) }
  }
  return { kind: 'raw', value: text }
}

function isQueryString(line) {
  return /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(line)
}

/** Repeated keys become arrays; single keys stay scalars. */
export function paramsToObject(searchParams) {
  const out = {}
  for (const [key, value] of searchParams) {
    if (key in out) {
      out[key] = Array.isArray(out[key]) ? [...out[key], value] : [out[key], value]
    } else {
      out[key] = value
    }
  }
  return out
}

function safeUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Object keys sorted, so two normalisations of one artefact are byte-identical. */
export function stableStringify(value, indent = 2) {
  return JSON.stringify(value, sortedReplacer(), indent)
}

function sortedReplacer() {
  return function replacer(_key, value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]))
  }
}

/**
 * Strip everything that varies between two runs of the same page, so a golden
 * fixture can be diffed against a live render.
 *
 * `normalise` keeps timings and browser identity because a real report wants
 * them; a committed golden cannot. Origins are rewritten because the fixture
 * server binds an ephemeral port, which otherwise leaks into every URL, into
 * `host`, and into params like GA4's `dl`. Serialised Dates are flattened
 * because `gtag('js', new Date())` puts wall-clock time in the dataLayer.
 */
export const CANONICAL_ORIGIN = 'http://fixture.test'
export const CANONICAL_DATE = '1970-01-01T00:00:00.000Z'

const ZEROED_KEYS = new Set(['tMs', 'durationMs'])
const DROPPED_KEYS = new Set(['startedAt', 'userAgent', 'version'])

export function canonicalise(capture, { origins = [], placeholder = CANONICAL_ORIGIN } = {}) {
  const targets = [capture?.target?.url, capture?.target?.finalUrl, ...origins]
  const pairs = buildRewrites(targets, placeholder)
  const rewrite = (text) => pairs.reduce((acc, [from, to]) => acc.split(from).join(to), text)

  const walk = (value) => {
    if (typeof value === 'string') return rewrite(value)
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      if (value.__type === 'date') return { __type: 'date', value: CANONICAL_DATE }
      const out = {}
      for (const [key, inner] of Object.entries(value)) {
        if (DROPPED_KEYS.has(key)) continue
        if (ZEROED_KEYS.has(key)) {
          out[key] = inner === null || inner === undefined ? inner : 0
          continue
        }
        out[key] = walk(inner)
      }
      return out
    }
    return value
  }

  return walk(capture)
}

/**
 * Longest origin first: a bare host is a substring of its own origin, so
 * rewriting the host first would leave a mangled scheme behind.
 */
function buildRewrites(urls, placeholder) {
  const placeholderHost = hostOf(placeholder) ?? 'fixture.test'
  const pairs = new Map()
  const add = (from, to) => {
    if (!from) return
    pairs.set(from, to)
    // GA4 puts the page URL in `dl`, so the origin also shows up
    // percent-encoded inside another URL's query string.
    for (const encoded of encodedVariants(from)) pairs.set(encoded, encodeURIComponent(to))
  }
  for (const value of urls) {
    if (typeof value !== 'string') continue
    const url = safeUrl(value)
    if (!url) continue
    add(url.origin, placeholder)
    add(url.host, placeholderHost)
    // A cookie's `domain` carries the bare hostname, with no port, so the
    // `host` rewrite above never matches it and the real host survives.
    add(url.hostname, placeholderHost)
  }
  return [...pairs.entries()].sort((a, b) => b[0].length - a[0].length)
}

/** Both hex cases: encodeURIComponent emits upper, plenty of tag code emits lower. */
function encodedVariants(value) {
  const upper = encodeURIComponent(value)
  if (upper === value) return []
  const lower = upper.replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase())
  return upper === lower ? [upper] : [upper, lower]
}

function hostOf(value) {
  return safeUrl(value)?.host ?? null
}
