/**
 * Global content-addressed aged save-under registry — the original's display list
 * (phase1b Q1/Q2). Entries are keyed by region rect and held on a LIFO stack, so
 * concurrent scenes that save different regions never collide (no per-scene slot
 * isolation needed). Snapshots relocate ownership from per-scene `state.save[slot]`.
 */
const rectKey = ({ x, y, width, height }) => `${x}:${y}:${width}:${height}`;

export const registerSaveUnder = (state, rect) => {
    const key = rectKey(rect);
    const snapshot = state.surface.snapshotRegion(rect); // full-size surface holding the region
    const entry = { key, x: rect.x, y: rect.y, width: rect.width, height: rect.height, surface: snapshot };
    const stack = (state.saveUnder ||= []);
    const existing = stack.findIndex((e) => e.key === key);
    if (existing !== -1) stack.splice(existing, 1);
    stack.unshift(entry); // head-push => LIFO restore
    return key;
};

export const restoreSaveUnder = (state, rect) => {
    const key = rectKey(rect);
    const stack = state.saveUnder || [];
    const idx = stack.findIndex((e) => e.key === key);
    if (idx === -1) return;
    const [entry] = stack.splice(idx, 1);
    state.surface.replaceRegionFrom(entry.surface, entry);
};

export const queueDeferredRestore = (state, entry) => {
    (state.pendingRestore ||= []).push({ ...entry, age: entry.age ?? 1 });
};

export const flushDeferredRestores = (state) => {
    const queue = state.pendingRestore || [];
    state.pendingRestore = [];
    for (const node of queue) {
        if (node.age <= 0) state.surface.replaceRegionFrom(node.surface, node);
        else queueDeferredRestore(state, { ...node, age: node.age - 1 });
    }
};
