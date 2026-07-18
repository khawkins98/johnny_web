const sceneIdentity = state => ({
    sceneIdx: state.sceneIdx ?? null,
    tagId: state.tagId ?? null,
});

export const traceFilename = (now = new Date()) => `dgds-${now.toISOString()}.jsonl`;

export const downloadJSONLines = (jsonLines, {
    filename = traceFilename(),
    documentRef = document,
    urlRef = URL,
} = {}) => {
    const blob = new Blob([jsonLines], { type: 'application/x-ndjson' });
    const objectUrl = urlRef.createObjectURL(blob);
    const anchor = documentRef.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    documentRef.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    urlRef.revokeObjectURL(objectUrl);
    return { filename };
};

export const createTraceRecorder = ({ pixelHashes = false } = {}) => {
    const events = [];
    let sequence = 0;
    let active = true;

    const append = (type, data = {}) => {
        events.push({ sequence: sequence++, type, ...data });
    };

    return {
        pixelHashes,
        get active() { return active; },
        record(type, data = {}) {
            if (active) append(type, data);
        },
        startSession(info) {
            events.length = 0;
            sequence = 0;
            active = true;
            append('session-start', info);
        },
        stopSession(info = {}) {
            if (active) append('session-stop', info);
            active = false;
        },
        clear() {
            events.length = 0;
            sequence = 0;
        },
        snapshot: () => events.map(event => ({ ...event })),
        toJSONLines: () => events.map(event => JSON.stringify(event)).join('\n') + '\n',
        download(options) {
            return downloadJSONLines(this.toJSONLines(), options);
        },
        async persist(url = '/__dgds_trace') {
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
