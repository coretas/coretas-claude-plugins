// playwright-core is imported lazily, not at module load. node_modules is not
// shipped with the plugin, so a fresh install has no dependencies until
// something runs `npm install` — and a bare ERR_MODULE_NOT_FOUND is a useless
// thing to show a user at that moment.
export class MissingDependencyError extends Error {
  constructor(cause) {
    super(
      'playwright-core is not installed. Run `npm install` in the capture directory first, then retry.'
    )
    this.name = 'MissingDependencyError'
    this.cause = cause
  }
}

let chromiumPromise

async function loadChromium() {
  chromiumPromise ??= import('playwright-core').then(
    (module) => module.chromium,
    (error) => {
      chromiumPromise = undefined
      throw new MissingDependencyError(error)
    }
  )
  return chromiumPromise
}

// Ordered: a browser already on the machine beats a 150 MB first-run download.
export const DEFAULT_CANDIDATES = [
  { channel: 'chrome', label: 'chrome' },
  { channel: 'msedge', label: 'msedge' },
  { channel: undefined, label: 'chromium' },
]

export class NoBrowserError extends Error {
  constructor(attempts) {
    super(
      'No Chromium-based browser available. Tried: ' +
        attempts.map((a) => `${a.label} (${a.reason})`).join(', ') +
        '. Install Google Chrome, or run: npx playwright-core install chromium'
    )
    this.name = 'NoBrowserError'
    this.attempts = attempts
  }
}

/**
 * Launch the first available candidate. `launcher` is injectable so the
 * resolution order can be tested without installing browsers.
 */
export async function launchBrowser({
  candidates = DEFAULT_CANDIDATES,
  headless = true,
  launcher = async (opts) => (await loadChromium()).launch(opts),
} = {}) {
  const attempts = []
  for (const candidate of candidates) {
    try {
      const browser = await launcher({ channel: candidate.channel, headless })
      return { browser, channel: candidate.label, version: browser.version() }
    } catch (err) {
      if (err instanceof MissingDependencyError) throw err
      attempts.push({ label: candidate.label, reason: firstLine(err) })
    }
  }
  throw new NoBrowserError(attempts)
}

function firstLine(err) {
  return String(err?.message ?? err).split('\n')[0]
}
