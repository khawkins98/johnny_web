/**
 * Keep the host-owned background visible while an ADS runtime plays.
 *
 * Some gags never load a screen themselves. In the original, ISLETEMP.SCR is
 * a file the host writes with the current island picture, so a gag that skips
 * LOAD_SCREEN simply plays over the island the host already drew. WALKSTUF.ADS
 * #1 (WOULDBEAS) is one: it never runs the WOULDBE.TTM tag that loads
 * ISLETEMP.SCR. Without this fallback the frame presenter clears the
 * background each tick and the gag plays over black.
 *
 * `presentHost(context)` draws the host background and returns its state, or
 * null when the host has none (for example, a non-island selection).
 */
export const withHostBackground = ({ presentHost, backgroundDecorator }) => (state, context) => {
    const runtimeHasBackground = Boolean(state.bkgScreen) || state.bkgOcean?.length > 0;
    const hostState = runtimeHasBackground ? null : presentHost(context);
    backgroundDecorator?.(hostState ?? state, context);
};
