# Consent mode

## What the plugin looked at

Google's consent mode signals: the `default` and `update` commands pushed to the `dataLayer`,
and the `gcs`/`gcd` consent-state values that hits themselves carried.

## not firing

Consent mode commands exist in the `dataLayer`, but no hit ever carried a `gcs` consent state:

1. The consent platform never actually calls `gtag('consent', ...)`, so the commands are
   declared but never executed.
2. A script error before the consent call stops it from running.

## inconsistent

Consent was accepted — a banner was clicked through — but hits still report a storage type as
denied:

1. The banner's "accept" action doesn't call `gtag('consent', 'update', ...)` for the storage
   types it should grant.
2. A race: hits fire before the update command is processed.
3. A region-specific default override still applies after the update — for example an IAB TCF
   configuration disagreeing with a custom banner.

## not present

No consent mode signals were observed at all. Expected outside regions that require Google's
consent mode, or deliberate if the site doesn't use it.

## What it cannot tell you

It sees the consent state hits carried (`gcs`), not how the consent platform is configured or
which vendors it was told to gate — that configuration lives in the consent management platform,
not on the wire.
