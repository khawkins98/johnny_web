const loadNamedEntry = (state, name) => state.resourceProvider.resolve(name);

export const selectOceanIndex = (state, isNight) => {
    const oceans = state.game?.background?.oceans || [];
    if (oceans.length === 0) return -1;
    const nightIndex = oceans.length - 1;
    return isNight ? nightIndex : state.compatibility.randomInt(0, Math.max(0, nightIndex - 1));
};

export const loadBackgroundAssets = state => {
    const profile = state.game?.background;
    if (!profile) return;
    for (const asset of profile.assets || []) {
        if (!state[asset.stateKey]) {
            state[asset.stateKey] = loadNamedEntry(state, asset.name) ?? null;
        }
    }
};

export const loadOcean = state => {
    const profile = state.game?.background;
    if (!profile) return;
    if (state.bkgOcean.length === 0) {
        for (const name of profile.oceans) {
            const resource = loadNamedEntry(state, name);
            if (resource !== undefined) state.bkgOcean.push(resource);
        }
    }

    const timeSetting = profile.settings?.time;
    const timeMode = timeSetting
        ? state.compatibility.setting(timeSetting, 'original')
        : 'original';
    const isNight = timeMode === 'local'
        ? (() => {
            const hour = state.compatibility.currentHour();
            return hour < 6 || hour >= 18;
        })()
        : state.isNightMode === true;
    const index = selectOceanIndex(state, isNight);
    if (index >= 0) state.bkgScreen = state.bkgOcean[index];
};

export const loadScreen = (state, name) => {
    const profile = state.game?.background;
    state.island = profile?.screens?.[name];

    if (!state.bkgScreen) {
        state.bkgScreen = loadNamedEntry(state, name) ?? null;
    }
    if (state.island) {
        loadBackgroundAssets(state);
        loadOcean(state);
    }
};
