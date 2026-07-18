import { composeTtmFrame, getCompositionRevision } from '../scripting/composition.mjs';
import { drawBackground } from '../scripting/frame-renderer.mjs';

/** Browser adapter for final composition, backgrounds, fades, and Canvas. */
export const createBrowserFramePresenter = ({ context, mainContext, presentationPolicy }) => {
    if (!context || !mainContext || !presentationPolicy) {
        throw new TypeError('Browser frame presenter requires contexts and a presentation policy');
    }

    let lastCompositionRevision = null;
    const clear = () => {
        context.clearRect(0, 0, 640, 480);
        lastCompositionRevision = null;
    };
    const backgroundState = state => (
        state.scenes.find(scene => scene?.state?.bkgScreen)?.state ?? state
    );
    const presentBackground = state => {
        mainContext.clearRect(0, 0, 640, 480);
        drawBackground(backgroundState(state), mainContext, presentationPolicy);
    };
    let foregroundImage = null;
    const presentForeground = surface => {
        if (!surface?.pixels || typeof context.putImageData !== 'function') return;
        if (!foregroundImage
            || foregroundImage.width !== surface.width
            || foregroundImage.height !== surface.height) {
            foregroundImage = context.createImageData(surface.width, surface.height);
        }
        foregroundImage.data.set(surface.pixels);
        context.putImageData(foregroundImage, 0, 0);
    };

    const present = (state, directive) => {
        if (directive.clearForeground && !directive.compose) clear();
        if (directive.backgroundOnly) drawBackground(state, mainContext, presentationPolicy);
        if (!directive.compose) return;

        const compositionRevision = getCompositionRevision(state);
        const fading = state.fadingOut || state.fadingIn;
        const changed = compositionRevision !== lastCompositionRevision;
        if (changed || fading) {
            context.clearRect(0, 0, 640, 480);
            composeTtmFrame(state);
            presentForeground(state.surface);
            lastCompositionRevision = compositionRevision;
        }
        presentBackground(state);

        if (fading) {
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

    };

    return { clear, present, presentBackground };
};
