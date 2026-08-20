import { SIGNALS, STATUSES } from '../vocabulary.mjs'

export function detectConversionLinker(evidence) {
  const { taggingPresent } = evidence.google
  const { cookies, params } = evidence.linker

  const observedValues = {
    linker_cookies: cookies,
    linker_params: params,
    google_tagging: taggingPresent,
  }

  if (!taggingPresent) {
    return finding(
      STATUSES.missing,
      'No Google tagging observed, so the conversion linker has nothing to attach to.',
      observedValues
    )
  }

  if (cookies.length > 0 || params.length > 0) {
    const evidenceList = [...cookies.map((name) => `${name} cookie`), ...params.map((name) => `${name} param`)].join(
      ', '
    )
    return finding(STATUSES.ok, `Conversion linker active: ${evidenceList}.`, observedValues)
  }

  return finding(
    STATUSES.notFiring,
    'Google tagging is present but no conversion linker evidence was observed; ad click IDs will not be attributed.',
    observedValues
  )
}

function finding(status, detail, observedValues) {
  return { signal: SIGNALS.conversionLinker, status, detail, tag_names: [], observed_values: observedValues }
}
