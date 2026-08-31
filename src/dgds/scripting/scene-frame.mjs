import { traceEvent } from './trace-event.mjs';
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
    // Immediate mode: a frame boundary only starts a new logical frame (the presenter
    // resets this scene's recorded draws); it neither clears nor restores the raster,
    // so there is no "restored region" to report.
    traceEvent(state, 'scene-frame-begin', { restoreSlot, revision: state.layerRevision });
};
