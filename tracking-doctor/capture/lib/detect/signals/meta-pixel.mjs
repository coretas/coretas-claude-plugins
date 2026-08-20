import { SIGNALS, STATUSES } from '../vocabulary.mjs'

export function detectMetaPixel(evidence) {
  const { hits, loaderSeen, pixelIds, events } = evidence.meta
  const successful = hits.filter((hit) => !hit.failure)
  const failed = hits.filter((hit) => hit.failure)

  const observedValues = {
    pixel_ids: pixelIds,
    events,
    hit_count: successful.length,
    failed_hit_count: failed.length,
    loader_seen: loaderSeen,
  }

  if (!loaderSeen && successful.length === 0) {
    return finding(STATUSES.missing, 'No Meta Pixel observed on this page.', observedValues)
  }

  if (loaderSeen && successful.length === 0) {
    const id = pixelIds[0] ?? '(none declared)'
    return finding(
      STATUSES.notFiring,
      `The Meta Pixel library loaded but pixel ${id} sent no events.`,
      observedValues
    )
  }

  if (pixelIds.length >= 2) {
    return finding(
      STATUSES.mismatched,
      `More than one Meta Pixel sent events from this page: ${pixelIds.join(', ')}.`,
      observedValues
    )
  }

  if (!events.includes('PageView')) {
    return finding(
      STATUSES.mismatched,
      `Meta Pixel ${pixelIds[0]} sent events (${events.join(', ')}) but no PageView.`,
      observedValues
    )
  }

  return finding(
    STATUSES.ok,
    `Meta Pixel ${pixelIds[0]} sent PageView and ${successful.length} event(s) in total.`,
    observedValues
  )
}

function finding(status, detail, observedValues) {
  return { signal: SIGNALS.metaPixel, status, detail, tag_names: [], observed_values: observedValues }
}
