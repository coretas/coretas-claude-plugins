# GA4 event coverage

## What the plugin looked at

The names of every GA4 event this page sent — both GA4's automatically-collected events
(`page_view`, `scroll`, `click`, and similar) and any custom events — and whether the same event
was sent more than once within one second of itself.

## not firing

GA4 sent events but never `page_view`:

1. `send_page_view` is disabled in the gtag configuration and no other tag is set up to send it.
2. A custom pageview event fires under a different name, so it isn't recognised as GA4's page
   view metric.

## inconsistent

Either `page_view` fired more than once within one second, or only GA4's automatic events were
observed with nothing custom instrumented:

1. Two separate GA4 tags — a native `gtag` snippet plus a tag-manager GA4 config tag — both fire
   `page_view`.
2. A single-page app re-fires the base tag on a route change without deduplication.
3. No conversion or engagement events (sign-up, purchase, and similar) are instrumented beyond
   GA4's defaults, so the page has visibility but nothing that measures what matters on it.

## not present

No GA4 events at all. This generally means GA4 isn't sending anything on this page — see
`references/ga4_config.md`.

## What it cannot tell you

It cannot tell you whether the custom event names it saw map to the conversions defined in your
GA4 property — only that events with those names were sent.
