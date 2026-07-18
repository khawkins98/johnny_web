/**
 * Faithful DGDS frame-timing values.
 *
 * TTM opcodes emit these authored directives without knowing how a host turns
 * them into waits, animation frames, or wall-clock deadlines.
 */
const DGDS_FRAME_BOUNDARY = 'dgds-frame-boundary';

export const createFrameBoundary = delayTicks => Object.freeze({
    type: DGDS_FRAME_BOUNDARY,
    delayTicks: Math.max(0, Math.trunc(delayTicks || 0)),
});

export const isFrameBoundary = value => value?.type === DGDS_FRAME_BOUNDARY;
