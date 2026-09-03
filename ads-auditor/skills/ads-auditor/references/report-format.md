# Rendering each section

`findings.json`'s `sections` array is already in the report's fixed order. Every entry has
`title`, `status` (`"computed"` or `"skipped"`), and either `payload` or `skip_reason`. A
`skipped` section renders as its heading plus one line: the `skip_reason`, verbatim — never
omit the heading, never invent numbers for it.

### 1. What We Received
Echo `brand`, `website`, `currency`. One line per entry in `platforms`: platform name,
`rows_parsed`, `date_range`. Print `data_source_disclaimer` and each line of
`what_could_not_be_checked` verbatim — these are fixed compliance copy, never paraphrase them.

### 2. Claimed vs. Actual
If skipped (no store revenue, or only one export), show the reason and stop there. Otherwise
render `combined_claim`, `store_revenue`, `gap` and `gap_pct` as a small table, then `label`
("measurement gap" — never say "double-counted" or "fraud"), then the `candidate_causes` list.

### 3. ROAS Decomposition and Brand Classification
`blended`: show `true_blended_roas` (labelled `true_blended_label`) and
`platform_attributed_blended_roas` (labelled `platform_attributed_blended_label`) side by side.
`brand_roas`: if `confidence` is `"low"`, print its `message` instead of numbers. `prospecting_roas`:
one row per platform (`spend`, `conversion_value`, `roas`) — never sum these across platforms.
Print `closing_line` verbatim at the end of this section.

### 4. KPI Table and Top Campaigns
One table per platform in `platforms`, plus one `combined` table: `spend`, `impressions`,
`clicks`, `ctr`, `cpc`, `conversions`, `conversion_value`, `roas`, `cpa`. Then a `top_campaigns`
table with the same columns plus `platform` and `name`. Print `definitions_footnote` verbatim,
directly under the tables — never collapse or omit it.

### 5. Automated Flags
Render `flags` as a ranked list (already ranked and capped at 7 — do not re-sort or truncate
further). Per flag: `finding` as the headline, then `implication`, then `action`, one sentence
each. If `unavailable` is non-empty, list each entry's `message` under a short "not evaluated"
note at the end of this section.

### 6. What Continuous Measurement Adds
Print `framing_line`, then `what_continuous_measurement_adds` as a short list. If
`unavailable_cross_platform_sections` is non-empty, name those sections as unavailable in this
run. Print `call_to_action` verbatim as the final line of the whole report — it already asks for
the findings, never the export files; do not add a second call to action of your own.

## Numbers

Every numeric field is a plain decimal string (already rounded where the section intends it).
Render as-is; do not re-round, and do not add a `%` sign to a field whose name already implies
one unless the value itself is a fraction (e.g. `gap_pct` is a fraction — multiply by 100 for
display; `share` fields inside flag `metadata` are also fractions).
