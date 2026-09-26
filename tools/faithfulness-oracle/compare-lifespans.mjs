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
//   This module compares one actor-duration value in engine ticks with the
//   [min, max] range observed in original-binary samples. Current callers use
//   the longest contiguous live span of each actor key, from completed gag
//   episodes (`ref.lifespans["slot:tag"] = { min, max }`).
//   The binary is sampled about every 57 ms; our engine ticks every 20 ms.
//   Convert reference samples to engine ticks before comparing (57/20 = 2.85).
//
// SMALL-N CAVEAT:
//   The reference range comes from a limited number of completed original
//   episodes. It is NOT a statistically tight bound. Our side keeps the
//   longest span across deterministic seeds.
//   Accordingly, these classifications are review signals, not test failures:
//     - A large multiplicative deviation (default 3x) is a HARD review item.
//     - Anything else outside the observed [min, max] range is only a WARN,
//       not a failure.
//   Actors that appear in only one of {ours, ref} are a VOCAB-level
//   concern (wrong actor drawn at all / actor missing entirely) and are out
//   of scope for this module — they are silently skipped here.

export const REFERENCE_SAMPLE_TO_ENGINE_TICKS = 2.85;

/**
 * Compare our engine's per-actor contiguous-span ticks against a reference's
 * span-lifespan range.
 *
 * @param {Object|Map<string, number>} ourActorTicks - "slot:tag" -> drawn-tick count (ours).
 * @param {Object|undefined|null} refLifespans - ref's `lifespans` object: "slot:tag" -> {min, max}.
 *   May be undefined/null for older refs generated before this field existed.
 * @param {Object} [opts]
 * @param {number} [opts.hardFactor=3] - multiplicative threshold for a HARD divergence.
 * @param {number} [opts.refSampleToOurTicks=2.85] - measured sample-cadence conversion.
 * @param {number} [opts.samplePhasePadding=0] - samples added at each end of a
 *   sampled span when the actor's start/end phase is unknown. For v2 captures,
 *   callers use 1: N observed samples can represent roughly N-1 to N+1
 *   sample intervals of real duration.
 * @returns {{ warnings: Array<Object>, hard: Array<Object> }}
 */
export function compareLifespans(ourActorTicks, refLifespans, opts = {}) {
  const {
    hardFactor = 3,
    refSampleToOurTicks = REFERENCE_SAMPLE_TO_ENGINE_TICKS,
    samplePhasePadding = 0,
  } = opts;

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
    const refMin = Math.max(0, range.min - samplePhasePadding) * refSampleToOurTicks;
    const refMax = (range.max + samplePhasePadding) * refSampleToOurTicks;

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
      refSampleMin: range.min,
      refSampleMax: range.max,
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
