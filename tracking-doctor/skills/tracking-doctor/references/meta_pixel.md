# Meta Pixel

## What the plugin looked at

The Meta Pixel loader script and requests to Meta's collection endpoint, checking for a
`PageView` event and reading the pixel ID(s) the hits carried.

## not firing

The loader script is present but no event was sent:

1. The base pixel call fires but is blocked before the request leaves the browser — an ad
   blocker, a consent platform, or a script error earlier on the page.
2. The pixel ID passed to `fbq('init', ...)` is missing or malformed, so `fbq('track', ...)` has
   nothing to send to.
3. `fbq('track', 'PageView')` is configured but on a trigger that isn't satisfied on this page.

## inconsistent

More than one pixel ID sent events, or events fired without a `PageView`:

1. Two separate pixel implementations exist — for example a native install plus a tag-manager
   tag — using different IDs.
2. A custom event fires but the base `PageView` call was removed, or fails silently before it.

## not present

No Meta Pixel was observed. This may be deliberate if Meta ads aren't run on this property. If
it's unexpected, check the pixel is actually published rather than sitting in a draft version.

## What it cannot tell you

It sees pixel IDs from network requests, not your Business Manager. It cannot tell you whether
that ID belongs to the ad account you intended to measure against.
