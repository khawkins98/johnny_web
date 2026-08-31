// Canonical trace emit helper. The canonical execution path EMITS events into an
// injected sink (`state.trace`, an optional recorder supplied by the host/diagnostics
// override); it never imports the recorder implementation. This keeps the core free
// of the observability layer while still describing what it does.

const sceneIdentity = (state) => ({
    sceneIdx: state.sceneIdx ?? null,
    tagId: state.tagId ?? null,
});

export const traceEvent = (state, type, data = {}) => {
    state.trace?.record(type, {
        tick: state.getTraceTick?.() ?? state.tick ?? null,
        ...sceneIdentity(state),
        ...data,
    });
};
