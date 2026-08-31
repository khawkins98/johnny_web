import { composeTtmFrame } from '../scripting/composition.mjs';
import { getCompositionRevision } from './composition-signature.mjs';
import { drawBackground } from '../scripting/frame-renderer.mjs';

/** Browser adapter for final composition, backgrounds, fades, and Canvas. */
export const createBrowserFramePresenter = ({
    context,
    mainContext,
    presentationPolicy,
    backgroundDecorator = null,
    preserveInitialForeground = false,
}) => {
    if (!context || !mainContext || !presentationPolicy) {
        throw new TypeError('Browser frame presenter requires contexts and a presentation policy');
    }

    let lastCompositionRevision = null;
    const clear = () => {
        context.clearRect(0, 0, 640, 480);
        lastCompositionRevision = null;
    };
    const backgroundState = (state) => state.scenes.find((scene) => scene?.state?.bkgScreen)?.state ?? state;
    const presentBackground = (state) => {
        mainContext.clearRect(0, 0, 640, 480);
        const source = backgroundState(state);
        const presentation = drawBackground(source, mainContext, presentationPolicy);
        backgroundDecorator?.(source, mainContext);
        return presentation;
    };
    let foregroundImage = null;
    let hasPresentedForeground = false;
    const presentForeground = (surface) => {
        if (!surface?.pixels || typeof context.putImageData !== 'function') return;
        if (!foregroundImage || foregroundImage.width !== surface.width || foregroundImage.height !== surface.height) {
            foregroundImage = context.createImageData(surface.width, surface.height);
        }
        foregroundImage.data.set(surface.pixels);
        context.putImageData(foregroundImage, 0, 0);
    };

    const present = (state, directive) => {
        const cleared = Boolean(directive.clearForeground && !directive.compose);
        if (cleared) clear();
        if (directive.backgroundOnly) {
            const background = drawBackground(state, mainContext, presentationPolicy);
            backgroundDecorator?.(state, mainContext);
            state.trace?.record('browser-background', { tick: state.tick ?? null, ...background });
        }
        if (!directive.compose) {
            state.trace?.record('browser-presentation', {
                tick: state.tick ?? null,
                compose: false,
                clearedForeground: cleared,
                backgroundOnly: Boolean(directive.backgroundOnly),
                uploadedForeground: false,
            });
            return;
        }

        const compositionRevision = getCompositionRevision(state);
        const fading = state.fadingOut || state.fadingIn;
        const changed = compositionRevision !== lastCompositionRevision;
        let retainedExternalForeground = false;
        if (changed || fading) {
            composeTtmFrame(state);
            retainedExternalForeground =
                preserveInitialForeground && !hasPresentedForeground && state.surface.bounds == null && !fading;
            if (!retainedExternalForeground) {
                context.clearRect(0, 0, 640, 480);
                presentForeground(state.surface);
                hasPresentedForeground = true;
            }
            lastCompositionRevision = compositionRevision;
        }
        const background = presentBackground(state);

        state.trace?.record('browser-presentation', {
            tick: state.tick ?? null,
            compose: true,
            clearedForeground: cleared,
            backgroundOnly: false,
            uploadedForeground: (changed || fading) && !retainedExternalForeground,
            reusedForeground: (!changed && !fading) || retainedExternalForeground,
            retainedExternalForeground,
            compositionRevision,
            pixels: state.trace.pixelHashes ? (state.surface.fingerprint?.() ?? null) : undefined,
            fading,
            cloudCount: state.titleState?.clouds?.length ?? (state.cloudIdx == null ? 0 : 1),
            background,
        });

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
