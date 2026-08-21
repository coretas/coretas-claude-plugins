/**
 * Consent banners gate tag firing, so a capture that never accepts one only
 * ever sees the pre-consent state. Requests are phase-tagged either side of the
 * click so detection can tell "blocked by consent" apart from "never fires".
 *
 * Finding the control and clicking it are deliberately separate steps: the
 * caller gets `onBeforeClick` so it can flip its phase marker in the same tick
 * as the click. Flipping it after this function returns tags consent-gated hits
 * as pre-consent, which inverts the one distinction the phases exist to draw.
 */

// Accept-all controls of the CMPs that actually show up in the wild.
export const KNOWN_ACCEPT_SELECTORS = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#usercentrics-root >>> button[data-testid="uc-accept-all-button"]',
  'button#didomi-notice-agree-button',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '.osano-cm-accept-all',
  '#termly-code-snippet-support button.t-acceptAllButton',
  '.cm-btn-success',
  '.iubenda-cs-accept-btn',
  '#hs-eu-confirmation-button',
  'button[aria-label="Accept all"]',
  'button[data-cookiebanner="accept_button"]',
]

// Fallback when the CMP is bespoke. Deliberately narrow: a wrong click on a
// diagnostic run is worse than no click.
const ACCEPT_TEXT =
  /^(accept( all)?( cookies)?|allow all|agree|i agree|got it|ok|прийняти( все)?|погоджуюсь|дозволити все|принять|akzeptieren|alle akzeptieren|tout accepter|aceptar( todo)?)$/i

const CLICK_TIMEOUT_MS = 2000

export async function acceptConsent(page, { timeoutMs = 5000, onBeforeClick } = {}) {
  const deadline = Date.now() + timeoutMs
  for (const frame of page.frames()) {
    if (Date.now() >= deadline) break
    const matched = await tryFrame(frame, deadline, onBeforeClick)
    if (matched) return matched
  }
  return null
}

async function tryFrame(frame, deadline, onBeforeClick) {
  for (const selector of KNOWN_ACCEPT_SELECTORS) {
    if (Date.now() >= deadline) return null
    const clicked = await clickIfVisible(
      frame.locator(selector).first(),
      `selector=${selector}`,
      onBeforeClick
    )
    if (clicked) return clicked
  }
  return tryByText(frame, deadline, onBeforeClick)
}

async function tryByText(frame, deadline, onBeforeClick) {
  let candidates
  try {
    candidates = await frame.locator('button, [role="button"], a[role="button"]').all()
  } catch {
    return null
  }
  for (const candidate of candidates.slice(0, 40)) {
    if (Date.now() >= deadline) return null
    let label
    try {
      label = ((await candidate.textContent({ timeout: 500 })) ?? '').trim()
    } catch {
      continue
    }
    if (!ACCEPT_TEXT.test(label)) continue
    const clicked = await clickIfVisible(candidate, `text=${label}`, onBeforeClick)
    if (clicked) return clicked
  }
  return null
}

async function clickIfVisible(locator, describedBy, onBeforeClick) {
  try {
    if (!(await locator.isVisible({ timeout: 250 }))) return null
    // Announced before the click, not after: anything the click triggers must
    // land in the phase the caller opens here.
    onBeforeClick?.(describedBy)
    await locator.click({ timeout: CLICK_TIMEOUT_MS })
    return { matched: describedBy }
  } catch {
    return null
  }
}
