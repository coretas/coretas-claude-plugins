import { normalise } from '../artefact.mjs'
import { collectEvidence } from './evidence.mjs'
import { detectConsentMode } from './signals/consent-mode.mjs'
import { detectConversionLinker } from './signals/conversion-linker.mjs'
import { detectGa4Config } from './signals/ga4-config.mjs'
import { detectGa4EventCoverage } from './signals/ga4-event-coverage.mjs'
import { detectGoogleAdsConversion } from './signals/google-ads-conversion.mjs'
import { detectMetaPixel } from './signals/meta-pixel.mjs'
import { EMITTABLE_STATUSES, SIGNAL_ORDER } from './vocabulary.mjs'

export class DetectionError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DetectionError'
  }
}

/**
 * Accepts either a raw artefact or an already-normalised capture. `run.startedAt`
 * is present on an artefact and dropped by `normalise()` — that is the only
 * field this function sniffs.
 */
export function detect(input) {
  const capture = input?.run?.startedAt !== undefined ? normalise(input) : input
  const evidence = collectEvidence(capture)

  const findings = [
    detectGa4Config(evidence),
    detectMetaPixel(evidence),
    detectConversionLinker(evidence),
    detectGoogleAdsConversion(evidence),
    detectGa4EventCoverage(evidence),
    detectConsentMode(evidence, capture),
  ]

  assertWellFormed(findings)

  return {
    schemaVersion: 1,
    target: { url: capture?.target?.url ?? null, finalUrl: capture?.target?.finalUrl ?? null },
    findings,
  }
}

/**
 * A silent wrong-vocabulary emission is the one failure mode this ticket
 * exists to prevent, so this asserts in code, not only in tests.
 */
function assertWellFormed(findings) {
  if (findings.length !== SIGNAL_ORDER.length) {
    throw new DetectionError(`detect() must produce exactly ${SIGNAL_ORDER.length} findings, got ${findings.length}`)
  }
  findings.forEach((found, index) => {
    if (found.signal !== SIGNAL_ORDER[index]) {
      throw new DetectionError(`Finding ${index} has signal "${found.signal}", expected "${SIGNAL_ORDER[index]}"`)
    }
    if (!EMITTABLE_STATUSES.includes(found.status)) {
      throw new DetectionError(`Finding for "${found.signal}" has non-emittable status "${found.status}"`)
    }
  })
}
