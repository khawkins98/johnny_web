/** Cabinet artwork coordinates in its original 1536×1024 image. See docs/island-ui-art.md. */
// Recompose the original PNG in two horizontal slices: 1160 source px become
// 1023 layout px, with the 376px control cheek kept round. Layout is 1399×1024.
export const CABINET_ASPECT = 1399 / 1024;
export const CABINET_APERTURE = Object.freeze({ x: 199 / 1399, y: 240 / 1024, width: 776 / 1399, height: 582 / 1024 });

/** Page height kept for the visible top of a tucked shelf; the cabinet may use everything above it. */
export const RECEDED_SHELF_RESERVE = 48;

/**
 * Top edge the cabinet may grow down to. A receded shelf yields its height whether or not it is
 * peeking, so a peek never resizes the picture.
 */
export function shelfTopFor(height, restingDeckTop, receded = false) {
    return receded ? Math.max(restingDeckTop, height - RECEDED_SHELF_RESERVE) : restingDeckTop;
}

export function islandLayout(width, height, shelfTop, minimumPicture = null) {
    const availableHeight = Math.max(80, Math.min(height, shelfTop) - 20);
    const minimumWidth = minimumPicture
        ? Math.max(
              minimumPicture.width / CABINET_APERTURE.width,
              (minimumPicture.height / CABINET_APERTURE.height) * CABINET_ASPECT,
          )
        : 1;
    const cabinetWidth = Math.max(
        minimumWidth,
        Math.min(width - (width <= 700 ? 12 : 48), availableHeight * CABINET_ASPECT),
    );
    const cabinetHeight = cabinetWidth / CABINET_ASPECT;
    const left = (width - cabinetWidth) / 2;
    const top = Math.max(0, (availableHeight - cabinetHeight) / 2);
    const a = CABINET_APERTURE;
    return {
        left,
        top,
        width: cabinetWidth,
        height: cabinetHeight,
        picture: {
            left: left + cabinetWidth * a.x,
            top: top + cabinetHeight * a.y,
            width: cabinetWidth * a.width,
            height: cabinetHeight * a.height,
        },
    };
}

/** Largest half-step zoom that fits; titles reserve room for the minimum .5×. */
export function halfStepScale(width, height, sourceWidth, sourceHeight) {
    return Math.max(0.5, Math.floor((Math.min(width / sourceWidth, height / sourceHeight) + 1e-6) * 2) / 2);
}

/**
 * Largest scale at which each source pixel covers the same whole number of device
 * pixels. Sizes are CSS pixels; dpr includes page zoom. Below one device pixel per
 * source pixel there is no clean step, so the continuous fit is returned.
 */
export function deviceStepScale(width, height, dpr, sourceWidth, sourceHeight) {
    const fit = Math.min(width / sourceWidth, height / sourceHeight);
    const multiple = Math.floor(fit * dpr + 1e-6);
    return multiple >= 1 ? multiple / dpr : fit;
}

/** Device pixels per source pixel from which even GPU resampling is worth its cost. */
export const RESAMPLE_MIN_DEVICE_PIXELS = 2;

/** Automatic sizing takes a clean step only when it keeps this share of the fitted size. */
export const AUTO_SHARP_MIN_FILL = 0.8;

/** Whether Automatic should use the whole-device-pixel step rather than a smooth fit. */
export function prefersDeviceStep(width, height, dpr, sourceWidth, sourceHeight) {
    const fit = Math.min(width / sourceWidth, height / sourceHeight);
    const step = deviceStepScale(width, height, dpr, sourceWidth, sourceHeight);
    return isDeviceSharp(step, dpr) && step >= fit * AUTO_SHARP_MIN_FILL - 1e-9;
}

/** True when nearest-neighbour scaling gives equal pixel blocks at this CSS scale. */
export function isDeviceSharp(scale, dpr) {
    const devicePixels = scale * dpr;
    return devicePixels > 1 - 1e-6 && Math.abs(devicePixels - Math.round(devicePixels)) < 1e-6;
}

/** CSS offset that moves an edge onto the nearest device-pixel boundary. */
export function deviceSnapOffset(edge, dpr) {
    return Math.round(edge * dpr) / dpr - edge;
}

// Retain the existing title API; live TV-off view shares the same step calculation.
export const titleScale = halfStepScale;
