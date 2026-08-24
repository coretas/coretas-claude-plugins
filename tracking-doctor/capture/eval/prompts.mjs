/**
 * Fixed phrasings, none of which name the skill, the plugin or a tool. Naming it
 * would test nothing: the point is that the frontmatter `description` earns the
 * load on its own.
 *
 * The URL is a constant placeholder. Trigger runs are given no shell, so it is
 * never fetched — it is there because a real user pastes one.
 */
export const PLACEHOLDER_URL = 'https://example.com'

export const TRIGGER_PROMPTS = Object.freeze([
  { id: 'check-tracking', prompt: `check my tracking on ${PLACEHOLDER_URL}` },
  { id: 'pixel-not-working', prompt: `why isn't my pixel working on ${PLACEHOLDER_URL}` },
  { id: 'ga4-firing', prompt: `is GA4 actually firing on ${PLACEHOLDER_URL}?` },
  {
    id: 'conversions-stopped',
    prompt: `my Google Ads conversions stopped recording last week, can you look at ${PLACEHOLDER_URL}`,
  },
  { id: 'audit-analytics', prompt: `audit the analytics setup on ${PLACEHOLDER_URL}` },
  { id: 'consent-mode', prompt: `does ${PLACEHOLDER_URL} send the right consent signals?` },
])

/**
 * Over-triggering costs every unrelated session tokens, so the "when not to use
 * this" section in SKILL.md is a claim worth testing too. Each of these is
 * adjacent to tracking and must not pull the skill in.
 */
export const NEGATIVE_PROMPTS = Object.freeze([
  { id: 'write-plan', prompt: 'write a GA4 event tracking plan for a new ecommerce site' },
  { id: 'define-cpc', prompt: 'what does CPC mean in Google Ads, and how does it differ from CPM?' },
  { id: 'add-snippet', prompt: 'add a gtag.js snippet to the index.html in this repository' },
  {
    id: 'read-report',
    prompt: 'summarise this GA4 report for me: 12,000 sessions, 240 conversions, 62% bounce rate',
  },
])

export const ALL_TRIGGER_CASES = Object.freeze([
  ...TRIGGER_PROMPTS.map((entry) => ({ ...entry, kind: 'positive' })),
  ...NEGATIVE_PROMPTS.map((entry) => ({ ...entry, kind: 'negative' })),
])
