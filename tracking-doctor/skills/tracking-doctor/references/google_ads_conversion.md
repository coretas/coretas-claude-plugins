# Google Ads conversions

## What the plugin looked at

Requests to Google Ads' conversion and remarketing endpoints, matching the conversion ID and
label the hits carried against what's declared in the page's tagging.

## not firing

A Google Ads ID is configured on the page but sent no conversion or remarketing hit:

1. The conversion tag's trigger never fires on this page — for example it's scoped to a
   thank-you page that wasn't visited in this audit; see `references/limits.md`.
2. A consent platform blocks `ad_storage` before the hit is sent.
3. The tag is paused in the container; see `references/limits.md`.

## inconsistent

Either two or more Google Ads IDs are declared, or the ID observed on the wire doesn't match
what's declared:

1. A legacy or test Ads account tag was never removed alongside a newer one.
2. The container publishes a different workspace than the one that was edited.

## not present

No Google Ads conversion tagging was observed. This may be deliberate if this page isn't a
conversion point, or if Google Ads isn't run on this property at all.

## What it cannot tell you

It cannot tell you whether the label that fired is the one your active campaigns actually
optimize for — that mapping lives in the ad account, not on the page.
