import { traceEvent } from './trace.mjs';
import { emitFrameOperation, FrameOperationType } from './frame-operation.mjs';

/**
 * Begin a new logical TTM frame and optionally seed it from a GET/PUT slot.
 *
 * The interpreter expresses DGDS frame intent here; the injected surface owns
 * the host-specific clearing and overwrite behavior.
 */
export const beginSceneFrame = (state, restoreSlot) => {
    const save = state.save[restoreSlot];
    state.layerRevision = (state.layerRevision || 0) + 1;
    emitFrameOperation(state, {
        type: FrameOperationType.BEGIN_SCENE_FRAME,
        restoreSlot,
    });

    if (save?.canDraw) {
        traceEvent(state, 'scene-frame-begin', {
            restoreSlot,
            restored: true,
            rect: { x: save.x, y: save.y, width: save.width, height: save.height },
            revision: state.layerRevision,
        });
    } else {
        traceEvent(state, 'scene-frame-begin', {
            restoreSlot,
            restored: false,
            revision: state.layerRevision,
        });
    }
};
