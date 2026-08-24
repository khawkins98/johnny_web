import { drawBackground } from '../../dgds/scripting/frame-renderer.mjs';

export const createJohnnyIslandPresentationState = ({ game, resourceProvider }) => ({
    game,
    backgroundId: 1,
    bkgScreen: null,
    bkgOcean: game.background.oceans.map((name) => resourceProvider.resolve(name)),
    bkgRes: resourceProvider.resolve('BACKGRND.BMP'),
    bkgRaft: resourceProvider.resolve('MRAFT.BMP'),
    dayOceanIndex: 0,
    cloudIdx: game.background.cloud.frames[0],
    cloudX: 0,
    cloudY: 0,
    cloudElapsed: 0,
    waveElapsed: 0,
    waveFrame: 0,
    titleState: null,
});

/** Keep Johnny's host-owned island alive while ADS runtimes come and go. */
export const createJohnnySelectionPresenter = ({ game, resourceProvider, presentationPolicy }) => {
    const state = createJohnnyIslandPresentationState({ game, resourceProvider });
    return (selection, mainContext) => {
        if (!selection.titleState?.island) return null;
        state.titleState = selection.titleState;
        state.dayOceanIndex = selection.titleState.oceanIndex ?? 0;
        drawBackground(state, mainContext, presentationPolicy);
        return state;
    };
};
