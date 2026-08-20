import { createRequire } from 'node:module'

import { SCHEMA_VERSION } from './artefact.mjs'
import { launchBrowser } from './browser.mjs'
import { acceptConsent } from './consent.mjs'
import { BINDING_NAME, installDataLayerHook } from './instrument.mjs'
import { createSettleTracker } from './settle.mjs'

export const DEFAULTS = {
  timeoutMs: 30_000,
  settleMs: 2_000,
  consent: 'accept',
  routes: [],
  dataLayerNames: ['dataLayer'],
  viewport: { width: 1280, height: 800 },
  maxDepth: 6,
  headless: true,
}

export async function capture(options) {
  const opts = { ...DEFAULTS, ...options }
  if (!opts.url) throw new Error('capture() requires a url')

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const deadline = t0 + opts.timeoutMs
  const elapsed = () => Date.now() - t0

  const requests = []
  const requestIndex = new Map()
  const dataLayer = []
  const navigations = []
  const errors = []

  // Read by the event listeners at the moment an event fires, which is what
  // attributes a request to the consent phase and route that produced it.
  // See PHASES in artefact.mjs for what each value means to a consumer.
  let phase = opts.consent === 'accept' ? 'pre-consent' : 'no-consent-step'
  let route = null

  const { browser, channel, version } = await (opts.launchBrowser ?? launchBrowser)({
    headless: opts.headless,
  })

  let context
  let settle
  let loaded = false
  let settled = false
  let consentResult = null
  let finalUrl = null

  let userAgent = null
  try {
    userAgent = await resolveUserAgent(browser)
    context = await browser.newContext({ viewport: opts.viewport, userAgent: userAgent ?? undefined })

    await context.exposeBinding(BINDING_NAME, (_source, entry) => {
      dataLayer.push({
        source: entry?.source ?? null,
        index: entry?.index ?? null,
        value: entry?.value ?? null,
        tMs: elapsed(),
        phase,
        route,
      })
    })
    await context.addInitScript(installDataLayerHook, {
      bindingName: BINDING_NAME,
      names: opts.dataLayerNames,
      maxDepth: opts.maxDepth,
    })

    context.on('request', (request) => {
      const entry = {
        tMs: elapsed(),
        phase,
        route,
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        postData: readPostData(request),
        frameUrl: readFrameUrl(request),
        status: null,
        failure: null,
      }
      requestIndex.set(request, requests.length)
      requests.push(entry)
    })
    context.on('response', (response) => {
      const index = requestIndex.get(response.request())
      if (index !== undefined) requests[index].status = response.status()
    })
    context.on('requestfailed', (request) => {
      const index = requestIndex.get(request)
      if (index !== undefined) requests[index].failure = request.failure()?.errorText ?? 'failed'
    })

    settle = createSettleTracker(context)
    const page = await context.newPage()

    page.on('pageerror', (error) => {
      errors.push({ tMs: elapsed(), kind: 'pageerror', message: String(error?.message ?? error) })
    })
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push({ tMs: elapsed(), kind: 'navigation', url: frame.url(), route })
      }
    })

    try {
      // 'commit' rather than 'load': the quiet-period waiter below decides when
      // the page is done, and a page that never fires load should still capture.
      await page.goto(opts.url, { waitUntil: 'commit', timeout: remaining(deadline) })
      loaded = true
    } catch (error) {
      errors.push({ tMs: elapsed(), kind: 'navigation-failed', message: firstLine(error) })
    }

    if (loaded) {
      settled = await settle.wait({ settleMs: opts.settleMs, deadline })

      if (opts.consent === 'accept') {
        let clickedAt = null
        const matched = await acceptConsent(page, {
          timeoutMs: Math.min(5_000, remaining(deadline)),
          // Fires in the same tick as the click, so the hits the click causes
          // are already tagged by the time they reach the request listener.
          onBeforeClick: () => {
            clickedAt = elapsed()
            phase = 'consent-click'
          },
        })
        consentResult = {
          action: 'accept',
          matched: matched?.matched ?? null,
          attempted: clickedAt !== null,
          tMs: clickedAt,
        }
        // No banner found is not the same state as consent granted, and a click
        // that was attempted but threw did not grant anything either.
        phase = matched ? 'post-consent' : clickedAt === null ? 'no-banner' : 'pre-consent'
        if (matched) settled = await settle.wait({ settleMs: opts.settleMs, deadline })
      } else {
        consentResult = { action: 'none', matched: null, attempted: false, tMs: null }
      }

      for (const target of opts.routes) {
        if (Date.now() >= deadline) break
        route = target
        navigations.push({ tMs: elapsed(), kind: 'route', url: target, route: target })
        try {
          await page.evaluate((path) => {
            history.pushState({}, '', path)
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
          }, target)
        } catch (error) {
          errors.push({ tMs: elapsed(), kind: 'route-failed', message: firstLine(error), route: target })
          continue
        }
        settled = await settle.wait({ settleMs: opts.settleMs, deadline })
      }

      finalUrl = page.url()
    }
  } finally {
    settle?.dispose()
    await context?.close().catch(() => {})
    await browser.close().catch(() => {})
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: 'tracking-doctor-capture', version: '0.1.0', playwright: playwrightVersion() },
    browser: { channel, version },
    target: { url: opts.url, finalUrl },
    options: {
      timeoutMs: opts.timeoutMs,
      settleMs: opts.settleMs,
      consent: opts.consent,
      routes: opts.routes,
      dataLayerNames: opts.dataLayerNames,
      viewport: opts.viewport,
      userAgent,
    },
    run: {
      startedAt,
      durationMs: elapsed(),
      loaded,
      settled,
      timedOut: Date.now() >= deadline && !settled,
    },
    consent: consentResult ?? { action: opts.consent, matched: null, attempted: false, tMs: null },
    navigations,
    requests,
    dataLayer,
    errors,
  }
}

/**
 * Headless Chrome announces itself in the UA string, and some tag setups and
 * consent platforms behave differently for it — which would make the capture
 * describe a page no real visitor sees.
 */
async function resolveUserAgent(browser) {
  let probeContext
  try {
    probeContext = await browser.newContext()
    const page = await probeContext.newPage()
    const agent = await page.evaluate(() => navigator.userAgent)
    return agent.includes('HeadlessChrome') ? agent.replace('HeadlessChrome', 'Chrome') : null
  } catch {
    return null
  } finally {
    await probeContext?.close().catch(() => {})
  }
}

function readPostData(request) {
  try {
    return request.postData()
  } catch {
    return null
  }
}

function readFrameUrl(request) {
  try {
    return request.frame()?.url() ?? null
  } catch {
    return null
  }
}

function remaining(deadline) {
  return Math.max(1, deadline - Date.now())
}

function firstLine(error) {
  return String(error?.message ?? error).split('\n')[0]
}

function playwrightVersion() {
  try {
    return createRequire(import.meta.url)('playwright-core/package.json').version
  } catch {
    return null
  }
}
