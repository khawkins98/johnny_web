import { FrameOperationType } from './frame-operation.mjs';

const setSavedRect = (saved, rect) => {
    saved.canDraw = true;
    saved.x = rect.x;
    saved.y = rect.y;
    saved.width = rect.width;
    saved.height = rect.height;
    saved.revision = (saved.revision || 0) + 1;
};

// The actor/primitive draws that make up a scene's CURRENT frame. Recorded per
// scene as they execute so `composeTtmFrame` can replay them every tick (faithful
// immediate-mode: redraw every active scene, every tick). BEGIN_SCENE_FRAME starts
// a fresh frame; STORE_AREA/SAVE_IMAGE_REGION/CLEAR_SURFACE are engine bookkeeping,
// not part of the visible frame, so they are not recorded/replayed.
const RECORDED_DRAWS = new Set([
    FrameOperationType.DRAW_SPRITE,
    FrameOperationType.FILL_RECT,
    FrameOperationType.FILL_CIRCLE,
    FrameOperationType.DRAW_LINE,
]);

/**
 * Apply a logical frame operation to the shared raster.
 *
 * Live pass (`replay` false, from the interpreter via emitFrameOperation): applies
 * the op AND records the actor draws into `state.frameOps` for this frame.
 * Replay pass (`replay` true, from composeTtmFrame): applies only, so the same op
 * list can be re-rendered every tick without re-recording.
 */
export const presentSurfaceFrameOperation = (state, operation, replay = false) => {
    const offset = state.titleState?.sceneOffset || { x: 0, y: 0 };
    const x = (value) => value + offset.x;
    const y = (value) => value + offset.y;
    const rect = (value) => ({ ...value, x: x(value.x), y: y(value.y) });

    if (!replay && operation.type === FrameOperationType.BEGIN_SCENE_FRAME) {
        // Start a new logical frame: its draws replace the previous frame's.
        state.frameOps = [];
    } else if (!replay && RECORDED_DRAWS.has(operation.type)) {
        (state.frameOps ||= []).push(operation);
    }

    switch (operation.type) {
        case FrameOperationType.CLEAR_SURFACE:
            state.surface.clear();
            break;

        case FrameOperationType.BEGIN_SCENE_FRAME:
            // Erasure is global and per-tick (composeTtmFrame clears the raster and
            // redraws every active scene). A frame boundary only resets this scene's
            // recorded frame; it no longer clears or restores the raster itself.
            break;

        case FrameOperationType.STORE_AREA: {
            const saved = state.saveBkg[operation.slot];
            if (!saved) break;
            const shifted = rect(operation.rect);
            setSavedRect(saved, shifted);
            state.surface.copyRegionTo(saved.surface, shifted);
            break;
        }

        case FrameOperationType.SAVE_IMAGE_REGION:
            // Sprite save-under (DGDS GET) has no pixel effect: the shipped engine's
            // RAM save-under is dormant and erasure is the per-tick clear+replay. The
            // logical opcode is still emitted for conformance/trace, but the presenter
            // does nothing with it.
            break;

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
