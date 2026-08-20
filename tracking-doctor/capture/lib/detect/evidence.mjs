import {
  ID_PATTERNS,
  LINKER_COOKIE_NAMES,
  LINKER_PARAM_NAMES,
  isGa4Hit,
  isGa4Loader,
  isGoogleTagManagerLoader,
  isMetaHit,
  isMetaLoader,
  matchGoogleAdsHit,
} from './endpoints.mjs'

/** `params` values may be a string or an array of repeated-key values. */
export function firstValue(params, key) {
  const value = params?.[key]
  return Array.isArray(value) ? value[0] : value
}

/**
 * A Meta pixel hit puts `id`/`ev` in the URL when it fires as a GET, or in a
 * query-string POST body — same shape either way once unpacked by `normalise()`.
 */
function mergedParams(request) {
  if (request.body?.kind === 'query') return { ...request.params, ...request.body.params }
  return request.params
}

function sortedUnique(values) {
  return [...new Set(values)].sort()
}

function toHit(request) {
  return {
    tMs: request.tMs,
    phase: request.phase,
    route: request.route,
    host: request.host,
    path: request.path,
    params: request.params ?? {},
    status: request.status,
    failure: request.failure,
  }
}

/** One pass over the capture producing the plain object the six rule modules read. */
export function collectEvidence(capture) {
  const requests = capture.requests ?? []
  const dataLayer = capture.dataLayer ?? []
  const cookies = capture.cookies ?? []

  const ga4 = { hits: [], declaredIds: [], loaderUrls: [], observedIds: [], events: [] }
  const meta = { hits: [], loaderSeen: false, pixelIds: [], events: [] }
  const ads = { hits: [], declaredIds: [], observedIds: [], labels: [], conversionHits: [], remarketingHits: [] }
  const google = { taggingPresent: false, hits: [] }
  const consent = { gcsValues: [], gcdValues: [], commands: [], phasesSeen: [] }
  const linker = { cookies: [], params: [] }

  for (const request of requests) {
    if (request.phase) consent.phasesSeen.push(request.phase)

    if (isGa4Loader(request)) {
      google.taggingPresent = true
      google.hits.push(toHit(request))
      ga4.loaderUrls.push(request.url)
      const id = firstValue(request.params, 'id')
      if (id && ID_PATTERNS.ga4Measurement.test(id)) ga4.declaredIds.push(id)
      if (id && ID_PATTERNS.adsConversion.test(id)) ads.declaredIds.push(id)
    }

    if (isGoogleTagManagerLoader(request) && !isGa4Loader(request)) {
      google.taggingPresent = true
      google.hits.push(toHit(request))
    }

    if (isGa4Hit(request)) {
      const hit = toHit(request)
      ga4.hits.push(hit)
      google.taggingPresent = true
      google.hits.push(hit)
      if (!request.failure) {
        const tid = firstValue(request.params, 'tid')
        if (tid) ga4.observedIds.push(tid)
        recordConsent(consent, request)
        recordLinkerParams(linker, request)
        for (const event of extractGa4Events(request, tid)) ga4.events.push(event)
      }
    }

    if (isMetaLoader(request)) meta.loaderSeen = true

    if (isMetaHit(request)) {
      const hit = toHit(request)
      meta.hits.push(hit)
      if (!request.failure) {
        const params = mergedParams(request)
        const id = firstValue(params, 'id')
        if (id) meta.pixelIds.push(id)
        const ev = firstValue(params, 'ev')
        if (ev) meta.events.push(ev)
      }
    }

    const adsMatch = matchGoogleAdsHit(request)
    if (adsMatch) {
      const hit = toHit(request)
      google.taggingPresent = true
      google.hits.push(hit)
      if (adsMatch.kind !== 'tagging') {
        ads.hits.push(hit)
        if (adsMatch.kind === 'conversion') ads.conversionHits.push(hit)
        if (adsMatch.kind === 'remarketing') ads.remarketingHits.push(hit)
        if (!request.failure) {
          if (adsMatch.kind === 'conversion' && adsMatch.id) ads.observedIds.push(adsMatch.id)
          const label = firstValue(request.params, 'label')
          if (label) ads.labels.push(label)
          recordConsent(consent, request)
          recordLinkerParams(linker, request)
        }
      }
    }
  }

  for (const entry of dataLayer) {
    if (entry.phase) consent.phasesSeen.push(entry.phase)
    if (entry.value?.__type !== 'arguments') continue
    const [command, ...args] = entry.value.values ?? []

    if (command === 'config') {
      const declared = args[0]
      if (typeof declared === 'string' && ID_PATTERNS.ga4Measurement.test(declared)) ga4.declaredIds.push(declared)
      if (typeof declared === 'string' && ID_PATTERNS.adsConversion.test(declared)) ads.declaredIds.push(declared)
    }

    if (command === 'consent' && (args[0] === 'default' || args[0] === 'update')) {
      consent.commands.push({
        kind: args[0],
        payload: args[1] ?? null,
        tMs: entry.tMs,
        phase: entry.phase,
        index: entry.index,
      })
    }
  }

  linker.cookies = sortedUnique(cookies.filter((cookie) => LINKER_COOKIE_NAMES.includes(cookie.name)).map((cookie) => cookie.name))

  return {
    ga4: {
      hits: ga4.hits,
      declaredIds: sortedUnique(ga4.declaredIds),
      loaderUrls: sortedUnique(ga4.loaderUrls),
      observedIds: sortedUnique(ga4.observedIds),
      events: ga4.events,
    },
    meta: {
      hits: meta.hits,
      loaderSeen: meta.loaderSeen,
      pixelIds: sortedUnique(meta.pixelIds),
      events: sortedUnique(meta.events),
    },
    ads: {
      hits: ads.hits,
      declaredIds: sortedUnique(ads.declaredIds),
      observedIds: sortedUnique(ads.observedIds),
      labels: sortedUnique(ads.labels),
      conversionHits: ads.conversionHits,
      remarketingHits: ads.remarketingHits,
    },
    google: {
      taggingPresent: google.taggingPresent,
      hits: google.hits,
    },
    consent: {
      gcsValues: sortedUnique(consent.gcsValues),
      gcdValues: sortedUnique(consent.gcdValues),
      commands: consent.commands,
      phasesSeen: sortedUnique(consent.phasesSeen),
    },
    linker: {
      cookies: linker.cookies,
      params: sortedUnique(linker.params),
    },
    cookies: sortedUnique(cookies.map((cookie) => cookie.name)),
  }
}

function recordConsent(consent, request) {
  const gcs = firstValue(request.params, 'gcs')
  if (gcs) consent.gcsValues.push(gcs)
  const gcd = firstValue(request.params, 'gcd')
  if (gcd) consent.gcdValues.push(gcd)
}

function recordLinkerParams(linker, request) {
  for (const name of LINKER_PARAM_NAMES) {
    if (firstValue(request.params, name) !== undefined) linker.params.push(name)
  }
}

/** A GET hit carries one event in `params.en`; a POST hit carries one per body row. */
function extractGa4Events(request, outerTid) {
  const { body, params, tMs, phase, route } = request
  const events = []

  if (body?.kind === 'query-rows') {
    for (const row of body.rows) {
      const name = firstValue(row, 'en')
      if (!name) continue
      events.push({ name, tMs, phase, route, tid: firstValue(row, 'tid') ?? outerTid ?? null, source: 'body-row' })
    }
    return events
  }

  if (body?.kind === 'query') {
    const name = firstValue(body.params, 'en')
    if (name) {
      events.push({
        name,
        tMs,
        phase,
        route,
        tid: firstValue(body.params, 'tid') ?? outerTid ?? null,
        source: 'body-row',
      })
    }
    return events
  }

  const name = firstValue(params, 'en')
  if (name) events.push({ name, tMs, phase, route, tid: outerTid ?? null, source: 'params' })
  return events
}
