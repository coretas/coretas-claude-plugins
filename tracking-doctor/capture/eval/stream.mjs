/**
 * Reads `claude -p --output-format stream-json` output. Everything here is
 * tolerant by design: an unparseable line is data about the run, not a crash,
 * and the harness has to report a bad run rather than die on it.
 */
export function parseEvents(ndjson) {
  const events = []
  const malformed = []
  for (const line of String(ndjson ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') events.push(parsed)
      else malformed.push(trimmed)
    } catch {
      malformed.push(trimmed)
    }
  }
  return { events, malformed }
}

const contentOf = (event) => {
  const content = event?.message?.content
  if (Array.isArray(content)) return content
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return []
}

export function toolUses(events) {
  return events.flatMap((event) =>
    contentOf(event)
      .filter((block) => block?.type === 'tool_use')
      .map((block) => ({ name: String(block.name ?? ''), input: block.input ?? {} }))
  )
}

/**
 * A skill can enter a session by more than one route — the `Skill` tool, a
 * plugin-namespaced tool name, or the model simply reading SKILL.md — and any of
 * them means the description earned the load. Each match records which route it
 * was, because "loaded, but only by reading the file" is a weaker result than a
 * `Skill` call and the summary should be able to say so.
 */
export function skillLoads(events, skillName) {
  const needle = String(skillName).toLowerCase()
  const loads = []

  for (const use of toolUses(events)) {
    const name = use.name.toLowerCase()
    const input = JSON.stringify(use.input ?? {}).toLowerCase()
    if (name === 'skill' && input.includes(needle)) loads.push({ via: 'skill-tool', tool: use.name })
    else if (name.includes(needle)) loads.push({ via: 'tool-name', tool: use.name })
    else if (name === 'read' && /skills\/[^"]*skill\.md/.test(input) && input.includes(needle)) {
      loads.push({ via: 'read-skill-md', tool: use.name })
    }
  }

  return loads
}

export const resultEvent = (events) => events.find((event) => event?.type === 'result') ?? null

/** The `result` message carries the assistant's last turn; fall back to the text blocks. */
export function finalText(events) {
  const result = resultEvent(events)
  if (typeof result?.result === 'string' && result.result.trim()) return result.result

  const texts = events
    .filter((event) => event?.type === 'assistant')
    .flatMap((event) => contentOf(event).filter((block) => block?.type === 'text').map((block) => block.text ?? ''))
  return texts.join('\n').trim()
}

export function costUsd(events) {
  const result = resultEvent(events)
  const cost = result?.total_cost_usd ?? result?.cost_usd
  return typeof cost === 'number' ? cost : null
}

/** A run is usable only if it ended in a non-error `result` event. */
export function runFailure(events, { exitCode = 0 } = {}) {
  const result = resultEvent(events)
  if (!result) return 'no result event in the stream'
  if (result.is_error === true) return `result reported an error: ${result.subtype ?? 'unknown'}`
  if (result.subtype && result.subtype !== 'success') return `result subtype ${result.subtype}`
  if (exitCode !== 0) return `claude exited ${exitCode}`
  return null
}

/**
 * The golden findings are the answer key. A run that read one — or globbed the
 * fixture directory — did not derive its report, whatever the report says.
 */
const ANSWER_KEY = /findings\.json|fixtures[\\/]golden/i

export function answerKeyReads(events) {
  return toolUses(events)
    .filter((use) => ANSWER_KEY.test(JSON.stringify(use.input ?? {})))
    .map((use) => use.name)
}
