import { FrameOperationType } from './frame-operation.mjs';
import { registerSaveUnder, restoreSaveUnder } from './save-under.mjs';

const setSavedRect = (saved, rect) => {
    saved.canDraw = true;
    saved.x = rect.x;
    saved.y = rect.y;
    saved.width = rect.width;
    saved.height = rect.height;
    saved.revision = (saved.revision || 0) + 1;
};

// Union of two axis-aligned rects (either may be null).
const unionRect = (a, b) => {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const right = Math.max(a.x + a.width, b.x + b.width);
    const bottom = Math.max(a.y + a.height, b.y + b.height);
    return { x, y, width: right - x, height: bottom - y };
};

// Accumulate this scene's per-frame drawn footprint (already offset-shifted) so
// the NEXT BEGIN_SCENE_FRAME can erase it. This reproduces the old per-scene
// surface.clear() that erased a moving/clear-and-redraw sprite each frame, but
// scoped to only this scene's own region on the shared raster.
const noteFootprint = (state, rect) => {
    if (rect && rect.width > 0 && rect.height > 0) state.frameFootprint = unionRect(state.frameFootprint, rect);
};

/** Apply a logical frame operation to the current retained surface model. */
export const presentSurfaceFrameOperation = (state, operation) => {
    const offset = state.titleState?.sceneOffset || { x: 0, y: 0 };
    const x = (value) => value + offset.x;
    const y = (value) => value + offset.y;
    const rect = (value) => ({ ...value, x: x(value.x), y: y(value.y) });
    switch (operation.type) {
        case FrameOperationType.CLEAR_SURFACE:
            state.surface.clear();
            break;

        case FrameOperationType.BEGIN_SCENE_FRAME: {
            // A new logical frame. First erase this scene's OWN previous-frame
            // footprint (to transparent, revealing the separate background canvas):
            // this reproduces the retired per-scene surface.clear() that erased a
            // moving/clear-and-redraw sprite each frame, but scoped to just this
            // scene's region so it never touches the background or other scenes.
            // Then restore any save-under region for scenes that use GET/PUT.
            if (state.frameFootprint) {
                state.surface.clear(state.frameFootprint);
                state.frameFootprint = null;
            }
            const rect = state.savedRects?.[operation.restoreSlot];
            if (rect) restoreSaveUnder(state.root ?? state, rect);
            break;
        }

        case FrameOperationType.STORE_AREA: {
            const saved = state.saveBkg[operation.slot];
            if (!saved) break;
            const shifted = rect(operation.rect);
            setSavedRect(saved, shifted);
            state.surface.copyRegionTo(saved.surface, shifted);
            break;
        }

        case FrameOperationType.SAVE_IMAGE_REGION: {
            // Sprite save-under: snapshot the region into the ONE global rect-keyed
            // registry (pixels live there, keyed by rect, never per-scene), and record
            // an index→rect pointer on the scene so a later BEGIN_SCENE_FRAME can
            // resolve which rect to restore for this saveIndex.
            const shifted = rect(operation.rect);
            registerSaveUnder(state.root ?? state, shifted);
            (state.savedRects ||= [])[operation.slot] = shifted;
            break;
        }

        case FrameOperationType.DRAW_LINE: {
            const x1 = x(operation.x1);
            const y1 = y(operation.y1);
            const x2 = x(operation.x2);
            const y2 = y(operation.y2);
            state.surface.drawLine(x1, y1, x2, y2, operation.color);
            noteFootprint(state, {
                x: Math.min(x1, x2),
                y: Math.min(y1, y2),
                width: Math.abs(x2 - x1) + 1,
                height: Math.abs(y2 - y1) + 1,
            });
            break;
        }

        case FrameOperationType.FILL_RECT:
            state.surface.fillRect(x(operation.x), y(operation.y), operation.width, operation.height, operation.color);
            noteFootprint(state, { x: x(operation.x), y: y(operation.y), width: operation.width, height: operation.height });
            break;

        case FrameOperationType.FILL_CIRCLE:
            state.surface.fillCircle(x(operation.x), y(operation.y), operation.radius, operation.color);
            noteFootprint(state, {
                x: x(operation.x) - operation.radius,
                y: y(operation.y) - operation.radius,
                width: operation.radius * 2 + 1,
                height: operation.radius * 2 + 1,
            });
            break;

        case FrameOperationType.DRAW_SPRITE: {
            const image = state.res[operation.slot]?.images?.[operation.frame];
            if (!image) break;
            state.surface.drawSprite(image, x(operation.x), y(operation.y), {
                clip: operation.clip ? rect(operation.clip) : operation.clip,
                flipX: operation.flipX,
            });
            noteFootprint(state, { x: x(operation.x), y: y(operation.y), width: image.width, height: image.height });
            break;
        }

        default:
            break;
    }
};
