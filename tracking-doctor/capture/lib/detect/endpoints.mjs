/**
 * Exact hosts and exact path rules for the signals detection reads. No
 * substring guessing on IDs, ever — that is the backend's CRM-1423 bug.
 */

export const ID_PATTERNS = Object.freeze({
  ga4Measurement: /^G-[A-Z0-9]{4,12}$/,
  gtmContainer: /^GTM-[A-Z0-9]{4,10}$/,
  adsConversion: /^AW-\d{9,12}$/,
  metaPixel: /^\d{13,17}$/,
})

const REGION_GA4_HOST = /^region\d+\.google-analytics\.com$/

export const KNOWN_GOOGLE_ANALYTICS_HOSTS = Object.freeze(['www.google-analytics.com', 'analytics.google.com'])

export const LINKER_COOKIE_NAMES = Object.freeze(['_gcl_au', '_gcl_aw', '_gcl_dc', '_gcl_gb', '_gcl_gf', '_gcl_ha'])

export const LINKER_PARAM_NAMES = Object.freeze(['gclid', 'gcl_aw', 'gcl_dc', '_gl', 'gbraid', 'wbraid'])

export function isKnownGoogleAnalyticsHost(host) {
  return KNOWN_GOOGLE_ANALYTICS_HOSTS.includes(host) || REGION_GA4_HOST.test(host ?? '')
}

/** `/g/collect` is GA4 on any host — a first-party server-side GTM container serves it too. */
export function isGa4Hit(request) {
  return request.path === '/g/collect'
}

/** `/collect` (no `/g`) is Universal Analytics, not GA4. */
export function isUniversalAnalyticsHit(request) {
  return request.path === '/collect'
}

export function isGa4Loader(request) {
  return (
    request.host === 'www.googletagmanager.com' &&
    (request.path === '/gtag/js' || request.path === '/gtm.js' || request.path === '/gtag/destination')
  )
}

export function isMetaLoader(request) {
  return request.host === 'connect.facebook.net' && Boolean(request.path?.endsWith('/fbevents.js'))
}

const META_HIT_HOSTS = Object.freeze(['www.facebook.com', 'web.facebook.com', 'connect.facebook.net'])

export function isMetaHit(request) {
  return META_HIT_HOSTS.includes(request.host) && (request.path === '/tr' || request.path === '/tr/')
}

/**
 * Returns `{ kind: 'conversion' | 'remarketing' | 'tagging', id: string | null }`
 * or `null` when the request is not a Google Ads endpoint.
 */
export function matchGoogleAdsHit(request) {
  const { host, path } = request
  if (host === 'td.doubleclick.net' && path === '/td/ga/rul') {
    return { kind: 'tagging', id: null }
  }

  if (host === 'googleads.g.doubleclick.net') {
    const viewthrough = matchConversionPath(path, 'viewthroughconversion')
    if (viewthrough) {
      return { kind: request.params?.label !== undefined ? 'conversion' : 'remarketing', id: viewthrough }
    }
    const onePConversion = matchConversionPath(path, '1p-conversion')
    if (onePConversion) return { kind: 'conversion', id: onePConversion }
  }

  if (host === 'www.googleadservices.com') {
    const id = matchConversionPath(path, 'conversion')
    if (id) return { kind: 'conversion', id }
  }

  if (host === 'www.google.com') {
    const id = matchConversionPath(path, 'conversion') ?? matchConversionPath(path, '1p-conversion')
    if (id) return { kind: 'conversion', id }
  }

  return null
}

function matchConversionPath(path, segment) {
  if (!path) return null
  const match = new RegExp(`/pagead/${segment}/(\\d+)(?:/|$)`).exec(path)
  return match ? match[1] : null
}

/** `googletagmanager.com` loaders count as Google tagging even without a GA4/Ads id. */
export function isGoogleTagManagerLoader(request) {
  return request.host === 'www.googletagmanager.com'
}

/** Character 2 is `ad_storage`, character 3 is `analytics_storage`. */
const GCS_PATTERN = /^G1([01-])([01-])$/

export function parseGcs(value) {
  const match = GCS_PATTERN.exec(value ?? '')
  if (!match) return null
  return { adStorage: decodeGcsChar(match[1]), analyticsStorage: decodeGcsChar(match[2]) }
}

function decodeGcsChar(char) {
  if (char === '1') return 'granted'
  if (char === '0') return 'denied'
  return 'unset'
}

/** Digit-only equality: `AW-123456789` matches path id `123456789`. No substring, no prefix. */
export function adsIdMatchesDigits(declaredAwId, digits) {
  return declaredAwId.slice('AW-'.length) === digits
}
