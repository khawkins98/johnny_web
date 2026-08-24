export const sequenceKey = (sceneIdx, tagId) => `${sceneIdx}:${tagId}`;

/** Match DGDS table mutation: remove the definition and append it. */
export const moveSequenceToBack = (order, sceneIdx, tagId) => {
    const key = sequenceKey(sceneIdx, tagId);
    const index = order.indexOf(key);
    if (index === -1) return false;
    order.splice(index, 1);
    order.push(key);
    return true;
};

export const sequencePaintIndex = (state, scene) => {
    const index = state.ttmSequenceOrder?.indexOf(scene.sequenceKey);
    return index == null || index < 0 ? Number.MAX_SAFE_INTEGER : index;
};
