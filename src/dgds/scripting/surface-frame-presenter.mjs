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
            // Persistent shared raster: a new logical frame erases only the previous
            // sprite by restoring its save-under REGION from the global registry,
            // never the whole surface. Overwrite is the clear.
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

        case FrameOperationType.DRAW_LINE:
            state.surface.drawLine(x(operation.x1), y(operation.y1), x(operation.x2), y(operation.y2), operation.color);
            break;

        case FrameOperationType.FILL_RECT:
            state.surface.fillRect(x(operation.x), y(operation.y), operation.width, operation.height, operation.color);
            break;

        case FrameOperationType.FILL_CIRCLE:
            state.surface.fillCircle(x(operation.x), y(operation.y), operation.radius, operation.color);
            break;

        case FrameOperationType.DRAW_SPRITE: {
            const image = state.res[operation.slot]?.images?.[operation.frame];
            if (!image) break;
            state.surface.drawSprite(image, x(operation.x), y(operation.y), {
                clip: operation.clip ? rect(operation.clip) : operation.clip,
                flipX: operation.flipX,
            });
            break;
        }

        default:
            break;
    }
};
