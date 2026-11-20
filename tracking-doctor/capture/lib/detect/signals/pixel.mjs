import { STATUSES } from '../vocabulary.mjs'

/**
 * The rule every ad pixel shares: loaded, fired, one id, and the platform's own
 * page-view event. `spec` names the signal, the product and that event.
 */
export function detectPixel(spec, pixel) {
  const { hits, loaderSeen, declaredIds, pixelIds, events } = pixel
  const successful = hits.filter((hit) => !hit.failure)
  const failed = hits.filter((hit) => hit.failure)
  const id = pixelIds[0] ?? declaredIds[0] ?? '(none declared)'

  const observedValues = {
    pixel_ids: pixelIds,
    declared_ids: declaredIds,
    events,
    hit_count: successful.length,
    failed_hit_count: failed.length,
    loader_seen: loaderSeen,
  }
  const finding = (status, detail) => ({
    signal: spec.signal,
    status,
    detail,
    tag_names: [],
    observed_values: observedValues,
  })

  if (!loaderSeen && successful.length === 0) {
    return finding(STATUSES.missing, `No ${spec.name} observed on this page.`)
  }

  if (successful.length === 0) {
    return finding(STATUSES.notFiring, `The ${spec.name} library loaded but pixel ${id} sent no events.`)
  }

  if (pixelIds.length >= 2) {
    return finding(STATUSES.mismatched, `More than one ${spec.name} sent events from this page: ${pixelIds.join(', ')}.`)
  }

  if (!events.includes(spec.pageview)) {
    const sent = events.length > 0 ? events.join(', ') : 'none named'
    return finding(STATUSES.mismatched, `${spec.name} ${id} sent events (${sent}) but no ${spec.pageview}.`)
  }

  return finding(STATUSES.ok, `${spec.name} ${id} sent ${spec.pageview} and ${successful.length} event(s) in total.`)
}
