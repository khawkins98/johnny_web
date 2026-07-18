import { FrameOperationType } from './frame-operation.mjs';

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
    switch (operation.type) {
    case FrameOperationType.CLEAR_SURFACE:
        state.surface.clear();
        break;

    case FrameOperationType.BEGIN_SCENE_FRAME: {
        state.surface.clear();
        const saved = state.save[operation.restoreSlot];
        if (saved?.canDraw) state.surface.replaceRegionFrom(saved.surface, saved);
        break;
    }

    case FrameOperationType.STORE_AREA: {
        const saved = state.saveBkg[operation.slot];
        if (!saved) break;
        setSavedRect(saved, operation.rect);
        state.surface.copyRegionTo(saved.surface, operation.rect);
        break;
    }

    case FrameOperationType.SAVE_IMAGE_REGION: {
        const saved = state.save[operation.slot];
        if (!saved) break;
        setSavedRect(saved, operation.rect);
        state.surface.copyRegionTo(saved.surface, operation.rect);
        break;
    }

    case FrameOperationType.DRAW_LINE:
        state.surface.drawLine(
            operation.x1,
            operation.y1,
            operation.x2,
            operation.y2,
            operation.color,
        );
        break;

    case FrameOperationType.FILL_RECT:
        state.surface.fillRect(
            operation.x,
            operation.y,
            operation.width,
            operation.height,
            operation.color,
        );
        break;

    case FrameOperationType.FILL_CIRCLE:
        state.surface.fillCircle(
            operation.x,
            operation.y,
            operation.radius,
            operation.color,
        );
        break;

    case FrameOperationType.DRAW_SPRITE: {
        const image = state.res[operation.slot]?.images?.[operation.frame];
        if (!image) break;
        state.surface.drawSprite(image, operation.x, operation.y, {
            clip: operation.clip,
            flipX: operation.flipX,
        });
        break;
    }

    default:
        break;
    }
};
