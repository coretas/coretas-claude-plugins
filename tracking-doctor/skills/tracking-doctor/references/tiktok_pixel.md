# TikTok Pixel

## What the plugin looked at

TikTok's pixel loader (`analytics.tiktok.com/i18n/pixel/events.js`, whose `sdkid` is the pixel
code) and the event beacons it sends to `analytics.tiktok.com/api/v2/pixel`, checking for a
`Pageview` event and reading the pixel code each beacon carried.

## not firing

The loader is present but no event was sent:

1. The beacon is blocked before it leaves the browser — an ad blocker, a script error earlier on
   the page, or a consent platform that called `ttq.holdConsent()` and never `ttq.grantConsent()`.
2. `ttq.load(...)` runs but nothing calls `ttq.page()` or `ttq.track(...)`, so the pixel has
   nothing to send.
3. The base code sits in a tag-manager tag whose trigger isn't satisfied on this page.

## inconsistent

More than one pixel code sent events, or events fired without a `Pageview`:

1. Two installs exist — for example a store's TikTok app plus a tag-manager tag — using
   different pixel codes.
2. An event such as `CompletePayment` fires but the base `ttq.page()` call was removed, or fails
   before it. TikTok spells it `Pageview`; a custom event named `PageView` does not count.

## not present

No TikTok Pixel was observed. This may be deliberate if TikTok ads aren't run on this property.
If it's unexpected, check the pixel is actually published rather than sitting in a draft
version, and that a consent platform is not holding it back.

## What it cannot tell you

It sees pixel codes from network requests, not your TikTok Ads Manager. It cannot tell you
whether that code belongs to the advertiser account you intended to measure against, or whether
server-side Events API conversions reach TikTok alongside the pixel.
