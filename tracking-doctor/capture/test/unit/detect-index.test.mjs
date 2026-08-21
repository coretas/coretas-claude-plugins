import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

import { normalise, parseArtefact, stableStringify } from '../../lib/artefact.mjs'
import { detect } from '../../lib/detect/index.mjs'
import { EMITTABLE_STATUSES, SIGNAL_ORDER } from '../../lib/detect/vocabulary.mjs'
import { FIXTURES } from '../helpers/paths.mjs'

const readCapture = async (name) => JSON.parse(await readFile(join(FIXTURES, 'captures', `${name}.json`), 'utf8'))

test('detect() always produces six findings in SIGNAL_ORDER', async () => {
  const findings = detect(await readCapture('healthy'))
  assert.equal(findings.findings.length, 6)
  assert.deepEqual(
    findings.findings.map((finding) => finding.signal),
    SIGNAL_ORDER
  )
})

test('tag_names is always an empty array, for every finding', async () => {
  for (const name of ['healthy', 'present-never-fires', 'no-tracking']) {
    const { findings } = detect(await readCapture(name))
    for (const finding of findings) assert.deepEqual(finding.tag_names, [])
  }
})

test('paused is never emitted, for any fixture', async () => {
  for (const name of ['healthy', 'present-never-fires', 'no-tracking']) {
    const { findings } = detect(await readCapture(name))
    for (const finding of findings) {
      assert.notEqual(finding.status, 'paused')
      assert.ok(EMITTABLE_STATUSES.includes(finding.status))
    }
  }
})

test('detect() auto-normalises a raw artefact via run.startedAt', async () => {
  const text = await readFile(join(FIXTURES, 'artefact-v1.json'), 'utf8')
  const artefact = JSON.parse(text)
  assert.ok(artefact.run.startedAt, 'fixture must be a raw artefact for this test to mean anything')

  const fromArtefact = detect(artefact)
  const fromCapture = detect(normalise(parseArtefact(text)))
  assert.equal(stableStringify(fromArtefact), stableStringify(fromCapture))
})

test('detect() is deterministic: the same input twice is byte-identical', async () => {
  const capture = await readCapture('healthy')
  assert.equal(stableStringify(detect(capture)), stableStringify(detect(capture)))
})

test('healthy.json: GA4, Meta, Ads, linker, event coverage and consent mode are all ok', async () => {
  const { findings } = detect(await readCapture('healthy'))
  assert.deepEqual(findings, [
    {
      signal: 'ga4_config',
      status: 'ok',
      detail: 'GA4 measurement ID G-HEALTHY1 sent 2 hit(s).',
      tag_names: [],
      observed_values: {
        measurement_ids_declared: ['G-HEALTHY1'],
        measurement_ids_observed: ['G-HEALTHY1'],
        hit_count: 2,
        failed_hit_count: 0,
        loader_urls: [
          'https://www.googletagmanager.com/gtag/js?id=AW-123456789',
          'https://www.googletagmanager.com/gtag/js?id=G-HEALTHY1',
        ],
      },
    },
    {
      signal: 'meta_pixel',
      status: 'ok',
      detail: 'Meta Pixel 1112223334445 sent PageView and 1 event(s) in total.',
      tag_names: [],
      observed_values: {
        pixel_ids: ['1112223334445'],
        events: ['PageView'],
        hit_count: 1,
        failed_hit_count: 0,
        loader_seen: true,
      },
    },
    {
      signal: 'conversion_linker',
      status: 'ok',
      detail: 'Conversion linker active: _gcl_au cookie.',
      tag_names: [],
      observed_values: { linker_cookies: ['_gcl_au'], linker_params: [], google_tagging: true },
    },
    {
      signal: 'google_ads_conversion',
      status: 'ok',
      detail: 'Google Ads conversion 123456789 fired with label(s) abc123.',
      tag_names: [],
      observed_values: {
        conversion_ids_declared: ['AW-123456789'],
        conversion_ids_observed: ['123456789'],
        labels: ['abc123'],
        hit_count: 1,
        failed_hit_count: 0,
        remarketing_only: false,
      },
    },
    {
      signal: 'ga4_event_coverage',
      status: 'ok',
      detail: 'GA4 sent page_view plus 1 instrumented event(s): sign_up.',
      tag_names: [],
      observed_values: {
        events: ['page_view', 'sign_up'],
        automatic_events: ['page_view'],
        custom_events: ['sign_up'],
        duplicates: [],
      },
    },
    {
      signal: 'consent_mode',
      status: 'ok',
      detail: 'Consent mode active; observed states: G111.',
      tag_names: [],
      observed_values: {
        gcs_values: ['G111'],
        gcd_values: [],
        commands: [
          { kind: 'default', payload: { ad_storage: 'denied', analytics_storage: 'denied' }, phase: 'pre-consent' },
          { kind: 'update', payload: { ad_storage: 'granted', analytics_storage: 'granted' }, phase: 'post-consent' },
        ],
        phases_seen: ['post-consent', 'pre-consent'],
      },
    },
  ])
})

test('present-never-fires.json: every loader present, nothing ever fires', async () => {
  const { findings } = detect(await readCapture('present-never-fires'))
  assert.deepEqual(
    findings.map((finding) => finding.status),
    ['not_firing', 'not_firing', 'not_firing', 'not_firing', 'missing', 'missing']
  )
  assert.deepEqual(findings, [
    {
      signal: 'ga4_config',
      status: 'not_firing',
      detail: 'GA4 measurement ID G-NEVER123 is configured on the page but no measurement hit was sent.',
      tag_names: [],
      observed_values: {
        measurement_ids_declared: ['G-NEVER123'],
        measurement_ids_observed: [],
        hit_count: 0,
        failed_hit_count: 0,
        loader_urls: [
          'https://www.googletagmanager.com/gtag/js?id=AW-123456789',
          'https://www.googletagmanager.com/gtag/js?id=G-NEVER123',
        ],
      },
    },
    {
      signal: 'meta_pixel',
      status: 'not_firing',
      detail: 'The Meta Pixel library loaded but pixel (none declared) sent no events.',
      tag_names: [],
      observed_values: { pixel_ids: [], events: [], hit_count: 0, failed_hit_count: 0, loader_seen: true },
    },
    {
      signal: 'conversion_linker',
      status: 'not_firing',
      detail:
        'Google tagging is present but no conversion linker evidence was observed; ad click IDs will not be attributed.',
      tag_names: [],
      observed_values: { linker_cookies: [], linker_params: [], google_tagging: true },
    },
    {
      signal: 'google_ads_conversion',
      status: 'not_firing',
      detail: 'Google Ads ID AW-123456789 is configured but no conversion or remarketing hit was sent.',
      tag_names: [],
      observed_values: {
        conversion_ids_declared: ['AW-123456789'],
        conversion_ids_observed: [],
        labels: [],
        hit_count: 0,
        failed_hit_count: 0,
        remarketing_only: false,
      },
    },
    {
      signal: 'ga4_event_coverage',
      status: 'missing',
      detail: 'No GA4 events observed on this page.',
      tag_names: [],
      observed_values: { events: [], automatic_events: [], custom_events: [], duplicates: [] },
    },
    {
      signal: 'consent_mode',
      status: 'missing',
      detail: 'No Google consent mode signals observed on this page.',
      tag_names: [],
      observed_values: { gcs_values: [], gcd_values: [], commands: [], phases_seen: ['pre-consent'] },
    },
  ])
})

test('no-tracking.json: a page with only its own assets is missing on every signal', async () => {
  const { findings } = detect(await readCapture('no-tracking'))
  assert.deepEqual(
    findings.map((finding) => finding.status),
    ['missing', 'missing', 'missing', 'missing', 'missing', 'missing']
  )
  assert.deepEqual(findings, [
    {
      signal: 'ga4_config',
      status: 'missing',
      detail: 'No GA4 tagging observed on this page.',
      tag_names: [],
      observed_values: { measurement_ids_declared: [], measurement_ids_observed: [], hit_count: 0, failed_hit_count: 0, loader_urls: [] },
    },
    {
      signal: 'meta_pixel',
      status: 'missing',
      detail: 'No Meta Pixel observed on this page.',
      tag_names: [],
      observed_values: { pixel_ids: [], events: [], hit_count: 0, failed_hit_count: 0, loader_seen: false },
    },
    {
      signal: 'conversion_linker',
      status: 'missing',
      detail: 'No Google tagging observed, so the conversion linker has nothing to attach to.',
      tag_names: [],
      observed_values: { linker_cookies: [], linker_params: [], google_tagging: false },
    },
    {
      signal: 'google_ads_conversion',
      status: 'missing',
      detail: 'No Google Ads conversion tagging observed on this page.',
      tag_names: [],
      observed_values: {
        conversion_ids_declared: [],
        conversion_ids_observed: [],
        labels: [],
        hit_count: 0,
        failed_hit_count: 0,
        remarketing_only: false,
      },
    },
    {
      signal: 'ga4_event_coverage',
      status: 'missing',
      detail: 'No GA4 events observed on this page.',
      tag_names: [],
      observed_values: { events: [], automatic_events: [], custom_events: [], duplicates: [] },
    },
    {
      signal: 'consent_mode',
      status: 'missing',
      detail: 'No Google consent mode signals observed on this page.',
      tag_names: [],
      observed_values: { gcs_values: [], gcd_values: [], commands: [], phases_seen: ['no-consent-step'] },
    },
  ])
})
