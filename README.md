# Coretas Claude Code Plugins

Credential-free diagnostics for advertising measurement, packaged as Claude Code plugins.

| Plugin | Status | What it does |
| --- | --- | --- |
| `tracking-doctor` | Available | Renders a page and reports what tracking actually fires |
| `ads-auditor` | Available | Audits Google/Meta ad exports for wasted spend and ROAS blending |

## Install

```bash
claude plugin marketplace add anthropics/claude-plugins-community

claude plugin install tracking-doctor@coretas
claude plugin install ads-auditor@coretas
```

Testing a change before it's listed there, or before a submission is accepted? Add this repo
directly instead — see [CONTRIBUTING.md](CONTRIBUTING.md#testing-an-install-locally):

```bash
claude plugin marketplace add coretas/coretas-claude-plugins
```

Verify what you installed:

```bash
claude plugin details tracking-doctor
claude plugin details ads-auditor
```

Then ask Claude Code to audit a URL, e.g. "check what tracking fires on https://example.com". The
first run installs one small dependency (`npm ci`, ~13 MB) if it isn't already present, and asks
before doing anything larger, like downloading a browser.

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

Each finding is `ok`, `missing`, `mismatched`, or `not_firing`. (A fifth outcome, `paused`,
exists in the shared vocabulary this plugin uses but describes container-config state a
rendered page cannot show, so it is never emitted here.)

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
and prints the findings there. The audited URL, its domain and the page contents never leave your
machine.

The report ends with one link to `app.coretas.ai`, tagged `utm_source`, `utm_medium`,
`utm_campaign` and `utm_content`. Only the last one varies: it names the single worst finding, such
as `conversion_linker` and `not_firing`. **Nothing is transmitted unless you click that link.**

If this ever changes, it will be stated here in the same change that makes it true.

## ads-auditor

Point it at a Google Ads and/or Meta Ads export (CSV or XLSX). It computes a health-check
report — wasted spend, ROAS blending, brand vs. prospecting split, conversion-tracking gaps —
using the same analysis Coretas's audit service runs, entirely on your machine.

No upload. No account. The report states plainly that the analysis ran locally and nothing was
transmitted, and its closing section asks for the **findings** if you want a walkthrough —
never your raw export files.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Releases: [RELEASING.md](RELEASING.md).

## Licence

MIT — see [LICENSE](LICENSE).
