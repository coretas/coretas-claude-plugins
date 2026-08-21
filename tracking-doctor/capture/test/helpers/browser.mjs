import { launchBrowser } from '../../lib/browser.mjs'

/**
 * The pure suite must stay runnable where no browser exists. These tests skip
 * rather than fail in that case, and CI installs a browser so they do run.
 */
export async function browserAvailable() {
  try {
    const { browser } = await launchBrowser({})
    await browser.close()
    return true
  } catch {
    return false
  }
}
