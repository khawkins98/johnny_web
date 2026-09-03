// compare-lifespans.mjs
//
// Duration/lifespan divergence signal for the faithfulness oracle.
//
// WHY THIS EXISTS (and how it differs from the existing maxConc gate):
//   The `maxConc` field in each reference fingerprint captures the PEAK
//   number of instances of an actor drawing at the same time. That catches
//   "too many copies on screen at once" bugs (e.g. the double-Johnny bug),
//   but it says nothing about DURATION. An actor that is drawn for far too
//   many ticks (stuck on screen, never retired) or far too few ticks
//   (dropped/skipped early) can have a perfectly normal maxConc of 1 the
//   entire time, and maxConc alone will never notice.
//
//   This module fills that gap by comparing, per "slot:tag" actor, how many
//   ticks OUR engine drew it against the [min, max] range of drawn-tick
//   counts observed across the N original-binary reference runs
//   (`ref.lifespans["slot:tag"] = { min, max }`).
//
// SMALL-N CAVEAT:
//   The reference range comes from only a handful of original-binary runs
//   (`runs` in the fingerprint, typically single digits). It is NOT a
//   statistically tight bound — it's a small sample. Because of that, the
//   thresholds here are deliberately loose/conservative to avoid false
//   positives:
//     - Only a large multiplicative deviation (default 3x) is treated as a
//       HARD divergence (a likely real bug: stuck-on or dropped-early actor).
//     - Anything else outside the observed [min, max] range is only a WARN,
//       not a failure.
//   Actors that appear in only one of {ours, ref} are a VOCAB-level
//   concern (wrong actor drawn at all / actor missing entirely) and are out
//   of scope for this module — they are silently skipped here.

/**
 * Compare our engine's per-actor drawn-tick counts against a reference's
 * lifespans range.
 *
 * @param {Object|Map<string, number>} ourActorTicks - "slot:tag" -> drawn-tick count (ours).
 * @param {Object|undefined|null} refLifespans - ref's `lifespans` object: "slot:tag" -> {min, max}.
 *   May be undefined/null for older refs generated before this field existed.
 * @param {Object} [opts]
 * @param {number} [opts.hardFactor=3] - multiplicative threshold for a HARD divergence.
 * @param {number} [opts.warnFactor=1] - reserved; currently any out-of-range (but not hard)
 *   deviation is a WARN regardless of this value.
 * @returns {{ warnings: Array<Object>, hard: Array<Object> }}
 */
export function compareLifespans(ourActorTicks, refLifespans, opts = {}) {
  const { hardFactor = 3, warnFactor = 1 } = opts;

  const result = { warnings: [], hard: [] };

  if (!refLifespans) {
    // Graceful handling of old refs that predate the lifespans field.
    return result;
  }

  const ourEntries = ourActorTicks instanceof Map
    ? ourActorTicks
    : new Map(Object.entries(ourActorTicks || {}));

  for (const [actor, ourTicks] of ourEntries) {
    if (!Object.prototype.hasOwnProperty.call(refLifespans, actor)) {
      // Only in ours -> vocab concern, out of scope here.
      continue;
    }

    const range = refLifespans[actor];
    if (!range || typeof range.min !== 'number' || typeof range.max !== 'number') {
      continue;
    }
    const { min: refMin, max: refMax } = range;

    // Within observed range -> OK, nothing to emit.
    if (ourTicks >= refMin && ourTicks <= refMax) {
      continue;
    }

    const tooLong = ourTicks > refMax;
    const tooShort = ourTicks < refMin;

    const overFactor = refMax > 0 ? ourTicks / refMax : Infinity;
    const underFactor = refMin > 0 ? refMin / ourTicks : null;

    const isHardLong = tooLong && ourTicks >= refMax * hardFactor;
    const isHardShort = tooShort && refMin > 0 && ourTicks <= refMin / hardFactor;

    const entry = {
      actor,
      ourTicks,
      refMin,
      refMax,
      factor: tooLong ? overFactor : (underFactor ?? null),
      reason: tooLong
        ? `drawn ${ourTicks} ticks vs ref max ${refMax} (${overFactor.toFixed(2)}x)`
        : `drawn ${ourTicks} ticks vs ref min ${refMin} (${underFactor != null ? underFactor.toFixed(2) : 'n/a'}x under)`,
    };

    if (isHardLong || isHardShort) {
      result.hard.push(entry);
    } else {
      result.warnings.push(entry);
    }
  }

  return result;
}

export default compareLifespans;
