# GA4 configuration

## What the plugin looked at

Requests to GA4's collection endpoint (`/g/collect`) and the `gtag/js` loader URL, matching the
measurement ID(s) hits carried against the ID(s) declared on the page itself.

## not firing

A declared measurement ID exists on the page but sent zero hits. Most likely first:

1. The GA4 tag's trigger never matches on this page — check its trigger conditions in your tag
   manager (e.g. scoped to a different path or an event that doesn't happen here).
2. A consent platform blocks the request before it leaves the browser — see
   `references/consent_mode.md`.
3. `send_page_view` is disabled and no other event is configured to fire.
4. The tag is paused in the container. A rendered page cannot tell "paused" apart from "never
   fires" — see `references/limits.md`.

## inconsistent

Either two or more distinct measurement IDs sent hits, or the ID observed on the wire doesn't
match what's declared on the page:

1. A second GA4 property was added — by a developer, a plugin, or a duplicate tag — alongside
   the intended one.
2. The container publishes a different workspace than the one that was edited, so production is
   serving stale configuration.
3. A hardcoded `gtag('config', ...)` call in the page source disagrees with what the tag manager
   sends.

## not present

No GA4 tagging of any kind was observed. This may be entirely deliberate — the page may not be
meant to carry analytics. If it's unexpected, check that the GA4 tag or gtag snippet is actually
published on this page and environment, not sitting in a draft version.

## What it cannot tell you

It can report that hits went to `G-XXXX`. It cannot know whether `G-XXXX` is the property you
meant to use — that requires reading your GA4 account, not the page.
