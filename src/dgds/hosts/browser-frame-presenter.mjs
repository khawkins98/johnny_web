import { composeTtmFrame } from '../scripting/composition.mjs';
import { drawBackground } from '../scripting/frame-renderer.mjs';

/** Browser adapter for final composition, backgrounds, fades, and Canvas. */
export const createBrowserFramePresenter = ({ context, mainContext, presentationPolicy }) => {
    if (!context || !mainContext || !presentationPolicy) {
        throw new TypeError('Browser frame presenter requires contexts and a presentation policy');
    }

    const clear = () => context.clearRect(0, 0, 640, 480);
    const backgroundState = state => (
        state.scenes.find(scene => scene?.state?.bkgScreen)?.state ?? state
    );
    const presentBackground = state => {
        mainContext.clearRect(0, 0, 640, 480);
        drawBackground(backgroundState(state), mainContext, presentationPolicy);
    };

    const present = (state, directive) => {
        if (directive.clearForeground) clear();
        if (directive.backgroundOnly) drawBackground(state, mainContext, presentationPolicy);
        if (!directive.compose) return;

        composeTtmFrame(state);
        presentBackground(state);

        if (state.fadingOut || state.fadingIn) {
            context.fillStyle = `rgba(0, 0, 0, ${state.fadeOpacity})`;
            context.fillRect(0, 0, 640, 480);

            if (state.fadingOut && state.fadeOpacity >= 1) {
                state.fadingOut = false;
            } else if (state.fadingIn) {
                state.fadeOpacity -= state.frameDelta / 400;
                if (state.fadeOpacity <= 0) {
                    state.fadingIn = false;
                    state.fadeOpacity = 0;
                }
            }
        }

        if (state.surface?.canvas) context.drawImage(state.surface.canvas, 0, 0);
    };

    return { clear, present, presentBackground };
};
