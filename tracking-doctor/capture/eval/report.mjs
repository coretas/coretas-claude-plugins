/**
 * Parses the report SKILL.md tells the model to print. Grading the printed
 * report rather than a machine-readable side channel is the point: the failure
 * mode this covers is the model reading correct findings and writing the wrong
 * thing about them.
 */
import { SIGNAL_ORDER } from '../lib/detect/vocabulary.mjs'
import { SIGNAL_LABELS, signalFromLabel, statusFromLabel } from './labels.mjs'

const SEPARATOR = /^[\s|:-]+$/

export function parseReport(text) {
  const statuses = {}
  const unparsedRows = []

  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (SEPARATOR.test(trimmed)) continue

    const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
    if (cells.length < 2) continue

    const signal = signalFromLabel(cells[0])
    const status = statusFromLabel(cells[1])
    if (!signal) continue
    if (!status) {
      unparsedRows.push(trimmed)
      continue
    }
    // First mention wins: a summary table above a per-signal recap must not be
    // overwritten by a later, looser restatement of the same row.
    if (!(signal in statuses)) statuses[signal] = status
  }

  return {
    statuses,
    unparsedRows,
    detailed: detailedSignals(text),
    missingSignals: SIGNAL_ORDER.filter((signal) => !(signal in statuses)),
  }
}

/** Signals that got their own `### <Label> — <severity>` block, not just a table row. */
function detailedSignals(text) {
  const found = new Set()
  for (const line of String(text ?? '').split('\n')) {
    const heading = /^#{2,4}\s+(.+)$/.exec(line.trim())
    if (!heading) continue
    const head = heading[1].split(/[—–-]/)[0]
    const signal = signalFromLabel(head)
    if (signal) found.add(signal)
  }
  return [...found].sort()
}

/** A report naming no signal at all is unusable, not merely wrong. */
export const isUsableReport = (parsed) => Object.keys(parsed.statuses).length > 0

export const labelFor = (signal) => SIGNAL_LABELS[signal] ?? signal
