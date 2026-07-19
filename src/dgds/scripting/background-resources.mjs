const loadNamedEntry = (state, name) => state.resourceProvider.resolve(name);

export const selectOceanIndex = (state, isNight) => {
    const oceans = state.game?.background?.oceans || [];
    if (oceans.length === 0) return -1;
    const nightIndex = oceans.length - 1;
    const dayCount = Math.max(1, nightIndex);
    return isNight ? nightIndex : Math.floor(state.random() * dayCount);
};

const loadBackgroundAssets = (state) => {
    const profile = state.game?.background;
    if (!profile) return;
    for (const asset of profile.assets || []) {
        if (!state[asset.stateKey]) {
            state[asset.stateKey] = loadNamedEntry(state, asset.name) ?? null;
        }
    }
};

export const loadOcean = (state) => {
    const profile = state.game?.background;
    if (!profile) return;
    if (state.bkgOcean.length === 0) {
        for (const name of profile.oceans) {
            const resource = loadNamedEntry(state, name);
            if (resource !== undefined) state.bkgOcean.push(resource);
        }
    }

    let index;
    if (state.isNightMode === true) {
        index = selectOceanIndex(state, true);
    } else {
        index = selectOceanIndex(state, false);
        state.dayOceanIndex = index;
    }
    if (index >= 0) state.bkgScreen = state.bkgOcean[index];
};

export const loadScreen = (state, name) => {
    const profile = state.game?.background;
    state.backgroundId = profile?.screens?.[name];

    if (!state.bkgScreen) {
        state.bkgScreen = loadNamedEntry(state, name) ?? null;
    }
    if (state.backgroundId) {
        loadBackgroundAssets(state);
        loadOcean(state);
    }
};
