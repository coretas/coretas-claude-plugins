import { parseGcs } from '../endpoints.mjs'
import { SIGNALS, STATUSES } from '../vocabulary.mjs'

const DENYING_KEYS = Object.freeze({ ad_storage: 'adStorage', analytics_storage: 'analyticsStorage' })

/**
 * `capture.consent.matched` — not the phase list — is what says a banner was
 * actually accepted. `no-banner` means there was nothing to accept.
 */
export function detectConsentMode(evidence, capture) {
  const { gcsValues, gcdValues, commands, phasesSeen } = evidence.consent
  const bannerAccepted = capture?.consent?.matched != null
  const hasUpdate = commands.some((command) => command.kind === 'update')

  const observedValues = {
    gcs_values: gcsValues,
    gcd_values: gcdValues,
    commands: commands.map((command) => ({ kind: command.kind, payload: command.payload, phase: command.phase })),
    phases_seen: phasesSeen,
  }

  if (gcsValues.length === 0 && gcdValues.length === 0 && commands.length === 0) {
    return finding(STATUSES.missing, 'No Google consent mode signals observed on this page.', observedValues)
  }

  if (commands.length > 0 && gcsValues.length === 0) {
    return finding(
      STATUSES.notFiring,
      'Consent mode commands are present in the dataLayer but no hit carried a consent state.',
      observedValues
    )
  }

  for (const [gcsKey, field] of Object.entries(DENYING_KEYS)) {
    const deniedByDefault = commands.some(
      (command) => command.kind === 'default' && command.payload?.[gcsKey] === 'denied'
    )
    if (!deniedByDefault) continue

    const stillDenied = gcsValues.every((value) => parseGcs(value)?.[field] === 'denied')
    if (bannerAccepted && (!hasUpdate || stillDenied)) {
      return finding(
        STATUSES.mismatched,
        `Consent was accepted but hits still report ${gcsKey} denied (gcs ${gcsValues.join(', ')}).`,
        observedValues
      )
    }
  }

  return finding(STATUSES.ok, `Consent mode active; observed states: ${gcsValues.join(', ')}.`, observedValues)
}

function finding(status, detail, observedValues) {
  return { signal: SIGNALS.consentMode, status, detail, tag_names: [], observed_values: observedValues }
}
