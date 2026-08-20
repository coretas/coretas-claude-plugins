import { adsIdMatchesDigits, matchGoogleAdsHit } from '../endpoints.mjs'
import { SIGNALS, STATUSES } from '../vocabulary.mjs'

export function detectGoogleAdsConversion(evidence) {
  const { hits, declaredIds, observedIds, labels, conversionHits, remarketingHits } = evidence.ads
  const successful = hits.filter((hit) => !hit.failure)
  const failed = hits.filter((hit) => hit.failure)
  const successfulConversions = conversionHits.filter((hit) => !hit.failure)
  const successfulRemarketing = remarketingHits.filter((hit) => !hit.failure)

  const buildValues = (remarketingOnly) => ({
    conversion_ids_declared: declaredIds,
    conversion_ids_observed: observedIds,
    labels,
    hit_count: successful.length,
    failed_hit_count: failed.length,
    remarketing_only: remarketingOnly,
  })

  if (declaredIds.length === 0 && hits.length === 0) {
    return finding(STATUSES.missing, 'No Google Ads conversion tagging observed on this page.', buildValues(false))
  }

  if (declaredIds.length > 0 && successful.length === 0) {
    return finding(
      STATUSES.notFiring,
      `Google Ads ID ${declaredIds.join(', ')} is configured but no conversion or remarketing hit was sent.`,
      buildValues(false)
    )
  }

  if (declaredIds.length >= 2) {
    return finding(
      STATUSES.mismatched,
      `More than one Google Ads ID is configured on this page: ${declaredIds.join(', ')}.`,
      buildValues(false)
    )
  }

  const unmatchedObserved = observedIds.some((id) => !declaredIds.some((declared) => adsIdMatchesDigits(declared, id)))
  if (unmatchedObserved) {
    return finding(
      STATUSES.mismatched,
      `Google Ads hits used conversion ID(s) ${observedIds.join(', ')} which are not configured on this page (${declaredIds.join(', ')}).`,
      buildValues(false)
    )
  }

  if (successfulConversions.length > 0) {
    const id = observedIds[0] ?? declaredIds[0]
    return finding(
      STATUSES.ok,
      `Google Ads conversion ${id} fired with label(s) ${labels.join(', ')}.`,
      buildValues(false)
    )
  }

  if (successfulRemarketing.length > 0) {
    const match = matchGoogleAdsHit(successfulRemarketing[0])
    const id = match?.id ?? declaredIds[0]
    return finding(
      STATUSES.ok,
      `Google Ads remarketing fired for ${id}; no labelled conversion event on this page.`,
      buildValues(true)
    )
  }

  return finding(
    STATUSES.ok,
    'Google Ads tagging observed; no conversion or remarketing hit fired.',
    buildValues(false)
  )
}

function finding(status, detail, observedValues) {
  return { signal: SIGNALS.googleAdsConversion, status, detail, tag_names: [], observed_values: observedValues }
}
