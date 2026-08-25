import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CAMPAIGN, CLEAN_CONTENT, LANDING_URL, buildCta, ctaContent, worstFinding } from '../../lib/cta.mjs'
import { detect } from '../../lib/detect/index.mjs'
import { EMITTABLE_STATUSES, SIGNAL_ORDER, STATUS_SEVERITY, STATUSES } from '../../lib/detect/vocabulary.mjs'
import { capturePath, goldenFixtureNames, readGolden } from '../helpers/golden.mjs'

const NON_OK = EMITTABLE_STATUSES.filter((status) => status !== STATUSES.ok)
const ALL_OK = SIGNAL_ORDER.map((signal) => ({ signal, status: STATUSES.ok }))
const withStatus = (signal, status) => ALL_OK.map((f) => (f.signal === signal ? { signal, status } : f))
const GOLDEN_NAMES = await goldenFixtureNames()
const ALLOWED_CONTENT = new Set([
  CLEAN_CONTENT,
  ...SIGNAL_ORDER.flatMap((signal) => NON_OK.map((status) => `${signal}-${status}`)),
])

describe('ctaContent', () => {
  it('is "clean" when every signal is ok', () => {
    assert.equal(ctaContent(ALL_OK), CLEAN_CONTENT)
  })

  it('names the single worst signal and its status', () => {
    assert.equal(ctaContent(withStatus('conversion_linker', 'not_firing')), 'conversion_linker-not_firing')
  })

  it('ranks by severity before declaration order', () => {
    const findings = [
      { signal: 'ga4_config', status: 'missing' },
      { signal: 'consent_mode', status: 'not_firing' },
    ]
    assert.equal(ctaContent(findings), 'consent_mode-not_firing')
  })

  it('breaks a severity tie on declaration order', () => {
    const findings = [
      { signal: 'consent_mode', status: 'mismatched' },
      { signal: 'meta_pixel', status: 'mismatched' },
    ]
    assert.equal(ctaContent(findings), 'meta_pixel-mismatched')
  })

  it('ranks the three non-ok statuses in this order, worst first', () => {
    assert.deepEqual(STATUS_SEVERITY, ['not_firing', 'mismatched', 'missing'])
  })

  it('prefers mismatched over missing even when missing is declared earlier', () => {
    const findings = [
      { signal: 'ga4_config', status: 'missing' },
      { signal: 'consent_mode', status: 'mismatched' },
    ]
    assert.equal(ctaContent(findings), 'consent_mode-mismatched')
  })

  it('prefers not_firing over mismatched even when mismatched is declared earlier', () => {
    const findings = [
      { signal: 'ga4_config', status: 'mismatched' },
      { signal: 'consent_mode', status: 'not_firing' },
    ]
    assert.equal(ctaContent(findings), 'consent_mode-not_firing')
  })

  it('orders every status pair by STATUS_SEVERITY', () => {
    for (let i = 0; i < STATUS_SEVERITY.length; i += 1) {
      for (let j = i + 1; j < STATUS_SEVERITY.length; j += 1) {
        const findings = [
          { signal: 'consent_mode', status: STATUS_SEVERITY[j] },
          { signal: 'consent_mode', status: STATUS_SEVERITY[i] },
        ]
        assert.equal(ctaContent(findings), `consent_mode-${STATUS_SEVERITY[i]}`)
      }
    }
  })

  it('treats an empty or absent finding set as clean rather than throwing', () => {
    assert.equal(ctaContent([]), CLEAN_CONTENT)
    assert.equal(ctaContent(undefined), CLEAN_CONTENT)
  })

  it('returns null from worstFinding when nothing is wrong', () => {
    assert.equal(worstFinding(ALL_OK), null)
  })
})

describe('buildCta carries nothing but vocabulary', () => {
  // Literal on purpose: a test that reads LANDING_URL pins nothing about where the link goes.
  it('points at the landing page on app.coretas.ai', () => {
    assert.equal(LANDING_URL, 'https://app.coretas.ai/tracking-doctor/')
    assert.ok(buildCta(ALL_OK).url.startsWith('https://app.coretas.ai/tracking-doctor/?'))
  })

  it('emits exactly the four utm parameters, in a fixed order', () => {
    const { searchParams } = new URL(buildCta(ALL_OK).url)
    assert.deepEqual([...searchParams.keys()], ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'])
    assert.equal(searchParams.get('utm_source'), 'tracking-doctor')
    assert.equal(searchParams.get('utm_medium'), 'plugin')
    assert.equal(searchParams.get('utm_campaign'), CAMPAIGN)
  })

  it('keeps origin and pathname pinned to the landing page for every input', () => {
    const landing = new URL(LANDING_URL)
    for (const signal of SIGNAL_ORDER) {
      for (const status of NON_OK) {
        const url = new URL(buildCta(withStatus(signal, status)).url)
        assert.equal(url.origin, landing.origin)
        assert.equal(url.pathname, landing.pathname)
      }
    }
  })

  it('draws utm_content from the vocabulary for every signal and status', () => {
    for (const signal of SIGNAL_ORDER) {
      for (const status of NON_OK) {
        const content = new URL(buildCta(withStatus(signal, status)).url).searchParams.get('utm_content')
        assert.ok(ALLOWED_CONTENT.has(content), `${signal}/${status} produced unlisted utm_content "${content}"`)
      }
    }
  })

  it('leaks no part of a finding beyond its signal and status', () => {
    const secret = 'https://client-staging.example.com/checkout?token=abc123'
    const findings = withStatus('meta_pixel', 'not_firing').map((finding) => ({
      ...finding,
      detail: `Observed on ${secret}`,
      observed_values: { loader_urls: [secret], page: secret },
      tag_names: [secret],
    }))
    const { url } = buildCta(findings)
    assert.ok(!url.includes('client-staging'))
    assert.ok(!url.includes('example.com'))
    assert.ok(!url.includes('abc123'))
    assert.equal(url, buildCta(withStatus('meta_pixel', 'not_firing')).url)
  })

  it('refuses an unknown signal instead of encoding it', () => {
    assert.throws(() => buildCta([{ signal: 'evil.example.com', status: 'not_firing' }]), /unknown signal/)
  })

  it('refuses a non-emittable status instead of encoding it', () => {
    assert.throws(() => buildCta([{ signal: 'ga4_config', status: 'paused' }]), /unknown status/)
    assert.throws(() => buildCta([{ signal: 'ga4_config', status: 'exfiltrate' }]), /unknown status/)
  })
})

describe('detect emits the link', () => {
  for (const name of GOLDEN_NAMES) {
    it(`${name}: nextStep.url never carries the audited target`, async () => {
      const capture = await readGolden(capturePath(name))
      const result = detect(capture)
      const { url } = result.nextStep

      assert.equal(new URL(url).origin, new URL(LANDING_URL).origin)
      const content = new URL(url).searchParams.get('utm_content')
      assert.ok(ALLOWED_CONTENT.has(content), `unlisted utm_content "${content}"`)
      for (const target of [result.target.url, result.target.finalUrl]) {
        if (!target) continue
        const { host, pathname } = new URL(target)
        assert.ok(!url.includes(host), 'the audited host reached the link')
        if (pathname !== '/') assert.ok(!url.includes(pathname), 'the audited path reached the link')
      }
    })

    it(`${name}: nextStep agrees with the findings it was built from`, async () => {
      const result = detect(await readGolden(capturePath(name)))
      assert.equal(new URL(result.nextStep.url).searchParams.get('utm_content'), ctaContent(result.findings))
    })
  }
})
