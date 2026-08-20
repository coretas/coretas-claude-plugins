import { SIGNALS, STATUSES } from '../vocabulary.mjs'

export function detectGa4Config(evidence) {
  const { hits, declaredIds, observedIds, loaderUrls } = evidence.ga4
  const successful = hits.filter((hit) => !hit.failure)
  const failed = hits.filter((hit) => hit.failure)

  const observedValues = {
    measurement_ids_declared: declaredIds,
    measurement_ids_observed: observedIds,
    hit_count: successful.length,
    failed_hit_count: failed.length,
    loader_urls: loaderUrls,
  }

  if (declaredIds.length === 0 && successful.length === 0) {
    return finding(STATUSES.missing, 'No GA4 tagging observed on this page.', observedValues)
  }

  if (declaredIds.length > 0 && successful.length === 0) {
    return finding(
      STATUSES.notFiring,
      `GA4 measurement ID ${declaredIds.join(', ')} is configured on the page but no measurement hit was sent.`,
      observedValues
    )
  }

  const declaredButUnobserved = declaredIds.length > 0 && !declaredIds.some((id) => observedIds.includes(id))
  const observedOutsideDeclared = declaredIds.length > 0 && observedIds.some((id) => !declaredIds.includes(id))

  if (observedIds.length >= 2) {
    return finding(
      STATUSES.mismatched,
      `More than one GA4 measurement ID sent hits from this page: ${observedIds.join(', ')}.`,
      observedValues
    )
  }

  if (declaredButUnobserved || observedOutsideDeclared) {
    return finding(
      STATUSES.mismatched,
      `Observed GA4 measurement IDs (${observedIds.join(', ')}) do not match the configured ID (${declaredIds.join(', ')}).`,
      observedValues
    )
  }

  const measurementId = declaredIds[0] ?? observedIds[0]
  return finding(STATUSES.ok, `GA4 measurement ID ${measurementId} sent ${successful.length} hit(s).`, observedValues)
}

function finding(status, detail, observedValues) {
  return { signal: SIGNALS.ga4Config, status, detail, tag_names: [], observed_values: observedValues }
}
