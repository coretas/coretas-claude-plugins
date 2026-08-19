# Coretas Claude Code Plugins

Credential-free diagnostics for advertising measurement, packaged as Claude Code plugins.

| Plugin | Status | What it does |
| --- | --- | --- |
| `tracking-doctor` | In development | Renders a page and reports what tracking actually fires |

## Status

**Early development.** The repository, manifests, and release flow are in place; the audit itself
is not implemented yet. Installing the plugin today gives you a placeholder.

## Install

```bash
claude plugin marketplace add coretas/coretas-claude-plugins
claude plugin install tracking-doctor@coretas
```

Verify what you installed:

```bash
claude plugin details tracking-doctor
```

## tracking-doctor

Point it at a URL. It loads the page in a real browser and reports what tracking requests actually
fire, across six signals:

| Signal | Question it answers |
| --- | --- |
| `ga4_config` | Does a GA4 configuration hit fire, and with which measurement ID? |
| `meta_pixel` | Does the Meta Pixel load and send a PageView? |
| `conversion_linker` | Is the click identifier preserved for conversion attribution? |
| `google_ads_conversion` | Does a Google Ads conversion hit fire? |
| `ga4_event_coverage` | Which GA4 events are actually sent? |
| `consent_mode` | What is the consent default state before any banner interaction? |

Each signal gets one of five outcomes: `ok`, `missing`, `mismatched`, `paused`, `not_firing`.

No account. No OAuth. No credentials of any kind.

### What it cannot see

It observes the **rendered page**. It does not read your tag manager configuration, so there are
questions it cannot answer, and it says so rather than guessing:

- It can tell you a GA4 hit went out with a given measurement ID. It cannot tell you whether that
  is the ID that *should* be there.
- It can tell you a tag did not fire on the page it looked at. It cannot tell you whether the tag
  is disabled, or attached to a trigger that this page does not satisfy.
- It sees the routes you point it at. It cannot tell you whether the rest of the site is
  instrumented the same way.

Answering those requires reading the container configuration alongside the page.
[Coretas](https://coretas.ai) does that.

## Privacy

`tracking-doctor` runs entirely on your machine. It loads the URL you give it in a local browser
and prints the findings. **Nothing is sent to Coretas or anywhere else**, and no audit results,
URLs, or page contents leave your machine.

If this ever changes, it will be stated here in the same change that makes it true.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Releases: [RELEASING.md](RELEASING.md).

## Licence

MIT — see [LICENSE](LICENSE).
