/** Builders for hand-built normalised captures, so rule tests state only what they care about. */

export function makeCapture({ requests = [], dataLayer = [], cookies = [], consent, target } = {}) {
  return {
    schemaVersion: 1,
    browser: { channel: 'chrome', version: '151.0.0.0' },
    target: target ?? { url: 'https://example.test/', finalUrl: 'https://example.test/' },
    options: {},
    run: { durationMs: 4000, timedOut: false, settled: true },
    consent: consent ?? { action: 'accept', matched: null, attempted: false, tMs: null },
    navigations: [],
    requests,
    dataLayer,
    cookies,
    errors: [],
  }
}

export function ga4Hit({
  tid,
  en,
  phase = 'post-consent',
  tMs = 1000,
  route = null,
  host = 'www.google-analytics.com',
  failure = null,
  extraParams = {},
  rows = null,
} = {}) {
  const params = { v: '2', tid, ...(en ? { en } : {}), ...extraParams }
  const query = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]])))
  const body = rows ? { kind: 'query-rows', rows } : null
  return {
    tMs,
    phase,
    route,
    method: rows ? 'POST' : 'GET',
    resourceType: rows ? 'fetch' : 'image',
    host,
    path: '/g/collect',
    url: `https://${host}/g/collect?${query.toString()}`,
    params,
    body,
    status: failure ? null : 204,
    failure,
    frameUrl: 'https://example.test/',
  }
}

export function metaHit({ id, ev, phase = 'post-consent', tMs = 1000, route = null, failure = null } = {}) {
  const params = { id, ...(ev ? { ev } : {}) }
  return {
    tMs,
    phase,
    route,
    method: 'POST',
    resourceType: 'fetch',
    host: 'www.facebook.com',
    path: '/tr',
    url: `https://www.facebook.com/tr?id=${id}${ev ? `&ev=${ev}` : ''}`,
    params,
    body: null,
    status: failure ? null : 200,
    failure,
    frameUrl: 'https://example.test/',
  }
}

const ADS_HOST_PATH = {
  conversion: (id) => ({ host: 'www.googleadservices.com', path: `/pagead/conversion/${id}/` }),
  remarketing: (id) => ({ host: 'googleads.g.doubleclick.net', path: `/pagead/viewthroughconversion/${id}/` }),
  tagging: () => ({ host: 'td.doubleclick.net', path: '/td/ga/rul' }),
}

export function adsHit({ id, label, kind = 'conversion', phase = 'post-consent', tMs = 1000, route = null, failure = null } = {}) {
  const { host, path } = ADS_HOST_PATH[kind](id)
  const params = label ? { label } : {}
  const query = new URLSearchParams(params).toString()
  return {
    tMs,
    phase,
    route,
    method: 'GET',
    resourceType: 'image',
    host,
    path,
    url: `https://${host}${path}${query ? `?${query}` : ''}`,
    params,
    body: null,
    status: failure ? null : 200,
    failure,
    frameUrl: 'https://example.test/',
  }
}

/** A `googletagmanager.com` loader — `/gtag/js` by default. */
export function loader({ id, path = '/gtag/js', phase = 'pre-consent', tMs = 500, failure = null } = {}) {
  return {
    tMs,
    phase,
    route: null,
    method: 'GET',
    resourceType: 'script',
    host: 'www.googletagmanager.com',
    path,
    url: `https://www.googletagmanager.com${path}?id=${id}`,
    params: { id },
    body: null,
    status: failure ? null : 200,
    failure,
    frameUrl: 'https://example.test/',
  }
}

/** A `gtag(...)` dataLayer push — `{ __type: 'arguments', values: [...] }`. */
export function gtagCommand({ command, args = [], phase = 'pre-consent', index = 0, tMs = 500 } = {}) {
  return {
    source: 'dataLayer',
    index,
    phase,
    route: null,
    tMs,
    value: { __type: 'arguments', values: [command, ...args] },
  }
}
