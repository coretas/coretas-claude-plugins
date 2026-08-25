import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isUsableReport, labelFor, linkShape, parseReport } from '../../eval/report.mjs'
import { buildCta } from '../../lib/cta.mjs'
import { SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'
import { REPORT_TABLE, reportText } from '../helpers/eval-stream.mjs'

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

// A host rewrite that matched nothing would compare a URL with itself and pass.
function rewrite(url, from, to) {
  const variant = url.replace(from, to)
  assert.notEqual(variant, url, `rewriting "${from}" matched nothing`)
  return variant
}

describe('next-step link', () => {
  it('finds the link the report printed', () => {
    const url = buildCta([{ signal: 'ga4_config', status: 'mismatched' }]).url
    assert.deepEqual(parseReport(`${REPORT_TABLE}\n\nNext: ${url}`).ctaUrls, [url])
  })

  it('unwraps markdown link syntax and drops sentence punctuation', () => {
    const url = buildCta([]).url
    assert.deepEqual(parseReport(`see [the other half](${url}).`).ctaUrls, [url])
  })

  it('reports every link printed, so an extra one can be graded', () => {
    const clean = buildCta([]).url
    const broken = buildCta([{ signal: 'meta_pixel', status: 'not_firing' }]).url
    assert.deepEqual(parseReport(`${clean} and also ${broken}`).ctaUrls, [clean, broken])
  })

  it('is empty when no link was printed', () => {
    assert.deepEqual(parseReport(REPORT_TABLE).ctaUrls, [])
  })

  it('ignores a plain coretas.ai link, as the limits section prints one', () => {
    assert.deepEqual(parseReport('what it cannot see is what [Coretas](https://coretas.ai) reads').ctaUrls, [])
  })

  it('catches a tracked link on any coretas.ai host or scheme, so grading cannot be escaped', () => {
    for (const raw of [
      'https://www.coretas.ai/tracking-doctor/?utm_content=clean&site=client.example.com',
      'http://coretas.ai/tracking-doctor/?utm_content=clean&site=client.example.com',
    ]) {
      assert.deepEqual(parseReport(`next: ${raw}`).ctaUrls, [raw], raw)
    }
  })

  it('reads a markdown-rendered link as the URL it means', () => {
    const url = buildCta([]).url
    const rendered = url.replace(/&/g, '&amp;amp;').replace('utm_content', 'utm\\_content')
    assert.deepEqual(parseReport(`next: ${rendered}`).ctaUrls, [url])
  })

  it('ignores another Coretas page a model named while explaining itself', () => {
    for (const mention of ['https://coretas.ai/pricing', 'https://coretas.ai/audit/', 'https://docs.coretas.ai/gtm']) {
      assert.deepEqual(parseReport(`Coretas reads that: ${mention}`).ctaUrls, [], mention)
    }
  })

  it('ignores a host that merely starts with ours', () => {
    assert.deepEqual(parseReport('https://coretas.ai.evil.test/tracking-doctor/?utm_content=clean').ctaUrls, [])
  })

  it('captures a link of ours stripped of its parameters, since that is tampering not absence', () => {
    const stripped = 'https://app.coretas.ai/tracking-doctor/?site=client-staging.example.com'
    assert.deepEqual(parseReport(`next: ${stripped}`).ctaUrls, [stripped])
    assert.notEqual(linkShape(stripped), linkShape(buildCta([]).url))
  })

  it('sees through a trailing dot on the host, in both directions', () => {
    const url = buildCta([]).url
    assert.equal(linkShape(rewrite(url, 'app.coretas.ai', 'app.coretas.ai.')), linkShape(url))
    const smuggled = 'https://client.example.com.coretas.ai./tracking-doctor/?utm_content=clean'
    assert.deepEqual(parseReport(`next: ${smuggled}`).ctaUrls, [smuggled])
    assert.notEqual(linkShape(smuggled), linkShape(url))
  })

  it('counts every component it does not declare as rendering as content', () => {
    const url = buildCta([]).url
    for (const [label, smuggled] of [
      ['fragment', `${url}#client-staging.example.com`],
      ['port', rewrite(url, 'app.coretas.ai', 'app.coretas.ai:8443')],
      ['userinfo', rewrite(url, 'https://', 'https://client.example.com@')],
    ]) {
      assert.deepEqual(parseReport(`next: ${smuggled}`).ctaUrls, [smuggled], label)
      assert.notEqual(linkShape(smuggled), linkShape(url), label)
    }
  })

  it('declares exactly four renderings equivalent: scheme, www, trailing dot, trailing slash, order', () => {
    const url = buildCta([]).url
    assert.equal(linkShape(rewrite(url, 'https://app.coretas.ai', 'http://www.app.coretas.ai')), linkShape(url))
    assert.equal(linkShape(rewrite(url, 'app.coretas.ai', 'app.coretas.ai:443')), linkShape(url))
    assert.equal(linkShape(rewrite(url, '/tracking-doctor/?', '/tracking-doctor?')), linkShape(url))
  })

  it('counts userinfo as content, which a browser hides from the user', () => {
    const url = buildCta([]).url
    const smuggled = rewrite(url, 'https://', 'https://client-staging.example.com@')
    assert.deepEqual(parseReport(`next: ${smuggled}`).ctaUrls, [smuggled])
    assert.notEqual(linkShape(smuggled), linkShape(url))
  })

  it('counts the host as content, so ours cannot be a suffix of the audited one', () => {
    const url = buildCta([]).url
    const smuggled = rewrite(url, 'app.coretas.ai', 'client-staging.example.com.app.coretas.ai')
    assert.deepEqual(parseReport(`next: ${smuggled}`).ctaUrls, [smuggled], 'must still be captured')
    assert.notEqual(linkShape(smuggled), linkShape(url))
    assert.equal(linkShape(rewrite(url, 'https://app.coretas.ai', 'http://www.app.coretas.ai')), linkShape(url))
  })

  it('compares what a link claims, not how it was written', () => {
    const url = buildCta([]).url
    const reordered = `${new URL(url).origin}/tracking-doctor/?utm_content=clean&utm_campaign=tracking-doctor-report&utm_medium=plugin&utm_source=tracking-doctor`
    assert.equal(linkShape(reordered), linkShape(url))
    assert.notEqual(linkShape(`${url}&site=client.example.com`), linkShape(url))
  })

  it('catches a tracked link whose path was rewritten, so grading cannot be escaped', () => {
    const tampered = 'https://app.coretas.ai/tracking-doctor?utm_content=clean&site=client-staging.example.com'
    assert.deepEqual(parseReport(`next: ${tampered}`).ctaUrls, [tampered])
  })
})
