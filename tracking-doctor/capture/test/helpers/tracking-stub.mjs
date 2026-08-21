/**
 * Offline stand-in for the real tracking endpoints.
 *
 * Golden fixtures have to use the genuine hosts and paths — `endpoints.mjs`
 * matches those exactly, so a fixture pointed at 127.0.0.1 detects as six
 * `missing` findings and proves nothing. Fulfilling the request inside the
 * browser keeps the real host in the capture while never touching the network.
 *
 * Anything outside the fixture origin and this host list is aborted rather than
 * allowed through: a fixture that silently reached the internet would make the
 * suite non-deterministic in the one way it exists to prevent.
 */

// 1x1 transparent GIF — what a real pixel endpoint answers with.
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64')

const TRACKING_HOSTS = Object.freeze([
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'analytics.google.com',
  'connect.facebook.net',
  'www.facebook.com',
  'www.googleadservices.com',
  'googleads.g.doubleclick.net',
  'td.doubleclick.net',
  'www.google.com',
])

/** Endpoints that answer with no body at all; everything else gets the pixel. */
const NO_CONTENT_PATHS = Object.freeze(['/g/collect', '/collect', '/td/ga/rul'])

// Fixtures fire the same URL more than once on purpose (duplicate page_view).
// Without this a memory-cache hit produces no second request and the defect
// vanishes from the capture.
const NO_STORE = { 'cache-control': 'no-store' }

export function createTrackingStub({ allowedOrigin }) {
  const stubbed = []
  const blocked = []

  const install = async (context) => {
    await context.route('**/*', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (url.origin === allowedOrigin) return route.continue()

      if (!TRACKING_HOSTS.includes(url.host)) {
        blocked.push(request.url())
        return route.abort('blockedbyclient')
      }

      stubbed.push(request.url())
      if (request.resourceType() === 'script') {
        return route.fulfill({
          status: 200,
          headers: NO_STORE,
          contentType: 'application/javascript; charset=utf-8',
          body: '',
        })
      }
      if (NO_CONTENT_PATHS.includes(url.pathname)) {
        return route.fulfill({ status: 204, headers: NO_STORE, body: '' })
      }
      return route.fulfill({ status: 200, headers: NO_STORE, contentType: 'image/gif', body: PIXEL_GIF })
    })
  }

  return { install, stubbed, blocked, hosts: TRACKING_HOSTS }
}
