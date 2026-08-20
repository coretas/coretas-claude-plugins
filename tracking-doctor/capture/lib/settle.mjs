/**
 * Network quiet-period waiter.
 *
 * Playwright's `networkidle` is unreliable on pages with long-polling or
 * heartbeat beacons — and tracking pages have plenty of both. This waits for a
 * continuous quiet window instead, and always returns rather than throwing so a
 * slow page still yields a partial capture.
 */
export function createSettleTracker(context) {
  let inflight = 0
  let lastChange = now()
  const bump = () => {
    lastChange = now()
  }
  const onRequest = () => {
    inflight += 1
    bump()
  }
  const onSettled = () => {
    inflight = Math.max(0, inflight - 1)
    bump()
  }

  context.on('request', onRequest)
  context.on('requestfinished', onSettled)
  context.on('requestfailed', onSettled)

  return {
    get inflight() {
      return inflight
    },
    /**
     * Resolve once the network has been idle for `settleMs`, or when `deadline`
     * passes. Returns true if it settled, false if the deadline cut it short.
     */
    async wait({ settleMs, deadline, pollMs = 50 }) {
      for (;;) {
        if (now() >= deadline) return false
        if (inflight === 0 && now() - lastChange >= settleMs) return true
        await sleep(Math.min(pollMs, Math.max(1, deadline - now())))
      }
    },
    dispose() {
      context.off('request', onRequest)
      context.off('requestfinished', onSettled)
      context.off('requestfailed', onSettled)
    },
  }
}

const now = () => Date.now()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
