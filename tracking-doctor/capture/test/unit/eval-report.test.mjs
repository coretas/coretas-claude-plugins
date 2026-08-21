import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isUsableReport, labelFor, parseReport } from '../../eval/report.mjs'
import { SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'
import { reportText } from '../helpers/eval-stream.mjs'

describe('report parsing', () => {
  it('reads all six statuses out of the documented table', () => {
    const parsed = parseReport(reportText())
    assert.deepEqual(Object.keys(parsed.statuses).sort(), [...SIGNAL_ORDER].sort())
    assert.ok(SIGNAL_ORDER.every((signal) => parsed.statuses[signal] === 'ok'))
    assert.deepEqual(parsed.missingSignals, [])
  })

  it('reads a defect row and the block that explains it', () => {
    const parsed = parseReport(reportText({ conversion_linker: 'not_firing' }))
    assert.equal(parsed.statuses.conversion_linker, 'not_firing')
    assert.deepEqual(parsed.detailed, ['conversion_linker'])
  })

  it('reports the signals a truncated report never mentioned', () => {
    const parsed = parseReport('| Signal | Status |\n| --- | --- |\n| GA4 configuration | working |')
    assert.deepEqual(parsed.statuses, { ga4_config: 'ok' })
    assert.deepEqual(parsed.missingSignals, SIGNAL_ORDER.filter((signal) => signal !== 'ga4_config'))
  })

  // The model restating a row further down must not overwrite the summary table.
  it('keeps the first status given for a signal', () => {
    const text = [reportText({ meta_pixel: 'mismatched' }), '', '| Meta Pixel | working | recap |'].join('\n')
    assert.equal(parseReport(text).statuses.meta_pixel, 'mismatched')
  })

  it('records a row whose status word is not vocabulary, without guessing', () => {
    const text = '| Signal | Status |\n| --- | --- |\n| Consent mode | probably fine | ... |'
    const parsed = parseReport(text)
    assert.deepEqual(parsed.statuses, {})
    assert.deepEqual(parsed.unparsedRows, ['| Consent mode | probably fine | ... |'])
  })

  it('ignores rows for things that are not signals', () => {
    const text = '| Cookie | Value |\n| --- | --- |\n| _ga | GA1.1 |'
    assert.deepEqual(parseReport(text).statuses, {})
  })

  it('calls a report with no signal row unusable', () => {
    assert.equal(isUsableReport(parseReport('I could not audit that page.')), false)
    assert.equal(isUsableReport(parseReport(reportText())), true)
  })

  it('accepts en dash, em dash and hyphen in a detail heading', () => {
    for (const dash of ['—', '–', '-']) {
      const text = `### Consent mode ${dash} medium\nDefault denied.`
      assert.deepEqual(parseReport(text).detailed, ['consent_mode'])
    }
  })

  it('labels a signal for display, falling back to the raw string', () => {
    assert.equal(labelFor('ga4_config'), 'GA4 configuration')
    assert.equal(labelFor('unknown'), 'unknown')
  })
})
