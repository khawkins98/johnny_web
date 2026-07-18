export const FrameOperationType = Object.freeze({
    CLEAR_SURFACE: 'clear-surface',
    BEGIN_SCENE_FRAME: 'begin-scene-frame',
    STORE_AREA: 'store-area',
    SAVE_IMAGE_REGION: 'save-image-region',
    DRAW_LINE: 'draw-line',
    FILL_RECT: 'fill-rect',
    FILL_CIRCLE: 'fill-circle',
    DRAW_SPRITE: 'draw-sprite',
});

/**
 * Emit one host-neutral drawing operation and synchronously present it through
 * the injected adapter. Synchronous presentation preserves DGDS GET/PUT
 * ordering while keeping surface retention details out of opcode callbacks.
 */
export const emitFrameOperation = (state, operation) => {
    const rect = operation.rect ? Object.freeze({ ...operation.rect }) : undefined;
    const clip = operation.clip ? Object.freeze({ ...operation.clip }) : undefined;
    const color = operation.color && typeof operation.color === 'object'
        ? Object.freeze({ ...operation.color })
        : operation.color;
    const emitted = Object.freeze({
        ...operation,
        ...(rect ? { rect } : {}),
        ...(clip ? { clip } : {}),
        ...(color !== undefined ? { color } : {}),
        tick: state.getTraceTick?.() ?? state.tick ?? null,
        sceneIdx: state.sceneIdx ?? null,
        tagId: state.tagId ?? null,
    });
    state.frameOperations?.push(emitted);
    state.presentFrameOperation?.(state, emitted);
    return emitted;
};
