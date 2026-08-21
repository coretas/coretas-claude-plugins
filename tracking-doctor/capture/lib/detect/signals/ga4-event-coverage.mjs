import { SIGNALS, STATUSES } from '../vocabulary.mjs'

/** GA4's own automatically-collected and enhanced-measurement events. */
export const AUTOMATIC_EVENTS = Object.freeze([
  'page_view',
  'session_start',
  'first_visit',
  'user_engagement',
  'scroll',
  'click',
  'view_search_results',
  'video_start',
  'video_progress',
  'video_complete',
  'file_download',
  'form_start',
  'form_submit',
])

const DUPLICATE_WINDOW_MS = 1000

export function detectGa4EventCoverage(evidence) {
  const { hits, events } = evidence.ga4

  const eventNames = sortedUnique(events.map((event) => event.name))
  const automaticEvents = eventNames.filter((name) => AUTOMATIC_EVENTS.includes(name))
  const customEvents = eventNames.filter((name) => !AUTOMATIC_EVENTS.includes(name))
  const duplicates = findDuplicates(events)

  const observedValues = {
    events: eventNames,
    automatic_events: automaticEvents,
    custom_events: customEvents,
    duplicates,
  }

  if (hits.length === 0) {
    return finding(STATUSES.missing, 'No GA4 events observed on this page.', observedValues)
  }

  const hasPageView = events.some((event) => event.name === 'page_view')
  if (!hasPageView) {
    return finding(STATUSES.notFiring, `GA4 sent ${events.length} event(s) but no page_view.`, observedValues)
  }

  const pageViewDuplicate = duplicates.find((group) => group.name === 'page_view')
  if (pageViewDuplicate) {
    return finding(
      STATUSES.mismatched,
      `page_view was sent ${pageViewDuplicate.count} times within one second, which will inflate counts.`,
      observedValues
    )
  }

  if (customEvents.length === 0) {
    return finding(
      STATUSES.mismatched,
      `Only GA4's automatic events were observed (${automaticEvents.join(', ')}); no custom or conversion events are instrumented on this page.`,
      observedValues
    )
  }

  return finding(
    STATUSES.ok,
    `GA4 sent page_view plus ${customEvents.length} instrumented event(s): ${customEvents.join(', ')}.`,
    observedValues
  )
}

/** Two events are duplicates when name, tid, route and phase match and |Δ tMs| <= 1000ms, chained. */
function findDuplicates(events) {
  const groups = new Map()
  for (const event of events) {
    const key = JSON.stringify([event.name, event.tid, event.route, event.phase])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(event)
  }

  const duplicates = []
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => (a.tMs ?? 0) - (b.tMs ?? 0))
    let run = [sorted[0]]
    const flush = () => {
      if (run.length >= 2) {
        duplicates.push({
          name: run[0].name,
          tid: run[0].tid,
          route: run[0].route,
          phase: run[0].phase,
          count: run.length,
          first_t_ms: run[0].tMs,
          last_t_ms: run[run.length - 1].tMs,
        })
      }
    }
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (Math.abs((curr.tMs ?? 0) - (prev.tMs ?? 0)) <= DUPLICATE_WINDOW_MS) {
        run.push(curr)
      } else {
        flush()
        run = [curr]
      }
    }
    flush()
  }
  return duplicates
}

function sortedUnique(values) {
  return [...new Set(values)].sort()
}

function finding(status, detail, observedValues) {
  return { signal: SIGNALS.ga4EventCoverage, status, detail, tag_names: [], observed_values: observedValues }
}
