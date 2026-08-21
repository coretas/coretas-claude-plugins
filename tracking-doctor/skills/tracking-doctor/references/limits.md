# What this cannot see without connected accounts

Observing a rendered page shows what fired, not why, and not what's configured behind it. These
are the specific things it cannot see — not a list of benefits, a list of blind spots.

1. **Why a tag did not fire.** A paused tag, an unmatched trigger, a blocking browser exception,
   and a consent platform intercepting the call all look identical from outside: nothing
   happened.
2. **Which tag it was.** The plugin observes network requests, not the tag manager's rows — this
   is why `tag_names` is always an empty array in every finding. It cannot point at a specific
   tag in your container.
3. **Paused state.** `paused` exists in the shared vocabulary these findings use, and this
   plugin never emits it: a paused tag and a deleted tag produce identical evidence — none —
   from outside the page.
4. **Whether an ID is the right ID.** It can report that hits went to `G-XXXX`. It cannot know
   whether `G-XXXX` is the property you meant to use.
5. **Pages it was not given.** A conversion tag that only fires on `/thank-you` is invisible
   unless that URL is audited. A single-URL audit is a single-URL claim, not a site-wide one.
6. **Server-side and container configuration.** A server-side container, the gap between the
   published and the edited workspace, and events sent from your backend are all outside what a
   browser render can see.
7. **Consent configuration.** It sees the consent state hits carried (`gcs`), not how the
   consent platform is configured or which vendors it was told to gate.

These are the questions that need the container configuration and the ad account, which is what
[Coretas](https://coretas.ai) reads.
