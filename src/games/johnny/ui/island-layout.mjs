/** Cabinet artwork coordinates in its original 1536×1024 image. See docs/island-ui-art.md. */
// Recompose the original PNG in two horizontal slices: 1160 source px become
// 1023 layout px, with the 376px control cheek kept round. Layout is 1399×1024.
export const CABINET_ASPECT = 1399 / 1024;
export const CABINET_APERTURE = Object.freeze({ x: 199 / 1399, y: 240 / 1024, width: 776 / 1399, height: 582 / 1024 });

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

// Retain the existing title API; live TV-off view shares the same step calculation.
export const titleScale = halfStepScale;
