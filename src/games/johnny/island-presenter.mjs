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

/**
 * Paint the host backdrop for an offscreen gag preview, matching
 * createJohnnySelectionPresenter: island scenes get the island and its ocean;
 * scenes the story marks as not on the island (Suzy, the office, the ending,
 * and their "meanwhile" clock) start on black, as in the original. Returns
 * the island state when it painted the island, else null.
 */
export const createPreviewHostPainter = ({ island, presentationPolicy }) => (context) => {
    if (island.titleState?.island === false) {
        context.fillStyle = '#000';
        context.fillRect(0, 0, 640, 480);
        return null;
    }
    drawBackground(island, context, presentationPolicy);
    return island;
};
