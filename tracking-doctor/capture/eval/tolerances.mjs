/**
 * The thresholds the nightly run reports against, so it emits a verdict rather
 * than raw model output. A model run is not deterministic; without a stated
 * tolerance every one of these gates is either flaky or vacuous.
 *
 * These are calibration seeds, not measurements. Tighten them from observed
 * nightly history — and move a threshold only with the run that justifies it.
 */
export const TOLERANCES = Object.freeze({
  /**
   * Every realistic phrasing must load the skill in at least this share of its
   * repeats. At the nightly default of one repeat it means every phrasing, every
   * night; raising `--repeats` is what buys the tolerance its slack.
   */
  minLoadRatePerPrompt: 0.8,
  /** Across all positive phrasings together. */
  minLoadRateOverall: 0.9,
  /** Share of negative-control runs allowed to pull the skill in. A rate, so repeats do not shift it. */
  maxFalseTriggerRate: 0.25,
  /** A `not_firing` or `mismatched` defect the report failed to name. Non-negotiable. */
  maxMissedCriticalDefects: 0,
  /** A `missing` defect the report failed to name — may read as deliberate on a real page. */
  maxMissedSoftDefects: 1,
  /** Report claims a defect on a signal the golden says is `ok`. */
  maxFalsePositivesPerCase: 1,
  maxFalsePositivesTotal: 2,
  /** Right signal named, wrong status against it. */
  maxWrongStatusTotal: 1,
  /** A report that cannot be parsed at all, or a run that errored out. */
  maxUnusableRuns: 0,
})

/** Per-run spend ceiling handed to `claude --max-budget-usd`, not a tolerance. */
export const BUDGET_USD = Object.freeze({ trigger: 0.5, audit: 1.5, smoke: 2 })
