import { traceEvent } from './trace.mjs';
import { emitFrameOperation, FrameOperationType } from './frame-operation.mjs';

/**
 * Begin a new logical TTM frame and optionally seed it from a GET/PUT slot.
 *
 * The interpreter expresses DGDS frame intent here; the injected surface owns
 * the host-specific clearing and overwrite behavior.
 */
export const beginSceneFrame = (state, restoreSlot) => {
    state.layerRevision = (state.layerRevision || 0) + 1;
    emitFrameOperation(state, {
        type: FrameOperationType.BEGIN_SCENE_FRAME,
        restoreSlot,
    });

    // SAVE_IMAGE_REGION no longer populates state.save[restoreSlot].canDraw; the
    // restore bookkeeping lives in the global save-under registry instead, so
    // derive the trace from state.savedRects, which surface-frame-presenter.mjs
    // keeps in sync with what was actually restored onto this slot.
    const savedRect = state.savedRects?.[restoreSlot];
    if (savedRect) {
        traceEvent(state, 'scene-frame-begin', {
            restoreSlot,
            restored: true,
            rect: savedRect,
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
