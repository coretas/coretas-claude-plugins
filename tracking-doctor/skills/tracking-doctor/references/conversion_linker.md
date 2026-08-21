# Conversion linker

## What the plugin looked at

Whether Google tagging (a `gtag.js` or GTM loader) is present on the page, and whether the
`_gcl_au` cookie or a `_gl`/`gclid`-style linker parameter was observed — the mechanism Google
Ads uses to attribute a conversion back to the ad click that caused it.

## not firing

Google tagging is present but no linker cookie or parameter was observed:

1. Consent mode denies `ad_storage`, which suppresses the linker cookie.
2. The site uses cross-domain linking — checkout lives on a different domain — but `linker`
   configuration or `_gl` parameter passing between the domains isn't set up.
3. A cookie-consent tool blocks first-party cookies more broadly than intended.

## inconsistent

This plugin currently treats linker evidence as present or absent, not as inconsistent — cookie
and parameter evidence both satisfy the signal on their own. If ad attribution still looks wrong
despite an `ok` status here, check cross-domain linking and enhanced-conversions configuration
directly; a rendered single page cannot surface that kind of mismatch.

## not present

No Google tagging was observed at all, so there is nothing for a linker to attach to. Expected
on a page carrying no GA4 or Google Ads tagging.

## What it cannot tell you

It sees that a linker cookie or parameter exists, not whether Google Ads is actually crediting
conversions to the right campaign — that mapping lives in the ad account.
