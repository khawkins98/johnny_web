const sceneIdentity = state => ({
    sceneIdx: state.sceneIdx ?? null,
    tagId: state.tagId ?? null,
});

export const createTraceRecorder = ({ pixelHashes = false } = {}) => {
    const events = [];
    let sequence = 0;

    return {
        pixelHashes,
        record(type, data = {}) {
            events.push({ sequence: sequence++, type, ...data });
        },
        clear() {
            events.length = 0;
            sequence = 0;
        },
        snapshot: () => events.map(event => ({ ...event })),
        toJSONLines: () => events.map(event => JSON.stringify(event)).join('\n') + '\n',
        async save(url = '/__dgds_trace') {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/x-ndjson' },
                body: this.toJSONLines(),
            });
            if (!response.ok) throw new Error(`Trace save failed: ${response.status}`);
            return response.json();
        },
    };
};

export const traceEvent = (state, type, data = {}) => {
    state.trace?.record(type, {
        tick: state.getTraceTick?.() ?? state.tick ?? null,
        ...sceneIdentity(state),
        ...data,
    });
};
