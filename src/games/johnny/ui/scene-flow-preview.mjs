import { DgdsRuntime } from '../../../dgds/scripting/runtime.mjs';
import { createSoftwareSurface } from '../../../dgds/scripting/surface.mjs';
import { createTimingCompatibility } from '../../../dgds/scripting/timing-compatibility.mjs';
import { DGDS_TICK_MS } from '../../../dgds/scripting/timing.mjs';
import { createBrowserFramePresenter } from '../../../dgds/hosts/browser-frame-presenter.mjs';
import { createBrowserPresentationPolicy } from '../../../dgds/hosts/browser-presentation-policy.mjs';
import { drawBackground } from '../../../dgds/scripting/frame-renderer.mjs';
import { __DEBUG__ } from '../../../dgds/scripting/process.mjs';
import { createJohnnyIslandPresentationState } from '../island-presenter.mjs';
import { johnnyCastaway } from '../manifest.mjs';

/** Run one child TTM animation in its own silent, offscreen DGDS runtime. */
export function mountSceneFlowPreview({ host, resolveEntry, sequenceTools, script, gagTag, slot, tag, route, storyDay, onError }) {
    const background = document.createElement('canvas');
    const heldFrame = document.createElement('canvas');
    const foreground = document.createElement('canvas');
    for (const canvas of [background, heldFrame, foreground]) {
        canvas.width = 640;
        canvas.height = 480;
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);
    }
    const resourceProvider = { resolve: resolveEntry };
    const policy = createBrowserPresentationPolicy();
    const live = __DEBUG__.getState();
    const currentGag = live?.data?.name === script && live?.data?.scenes?.[live.currentScene]?.tagId?.id === gagTag;
    const titleState = currentGag && live.titleState
        ? live.titleState : sequenceTools?.preview?.(script, gagTag, { storyDay })?.titleState;
    const island = createJohnnyIslandPresentationState({ game: johnnyCastaway, resourceProvider });
    island.titleState = titleState;
    const mainContext = background.getContext('2d');
    const heldContext = heldFrame.getContext('2d');
    const foregroundContext = foreground.getContext('2d');
    drawBackground(island, mainContext, policy);
    const presenter = createBrowserFramePresenter({
        context: foregroundContext,
        mainContext,
        presentationPolicy: policy,
        backgroundDecorator: (state, context) => {
            if (!state.bkgScreen && !state.bkgOcean?.length) drawBackground(island, context, policy);
        },
    });
    const data = resolveEntry(script);
    if (!data) throw new Error(`Missing ADS resource ${script}`);
    const runtime = new DgdsRuntime({
        type: 'ADS', data, adsSceneTag: gagTag, singleAdsScene: true,
        childScenePreview: { slot, tag, route, armed: false },
        resourceProvider, game: johnnyCastaway, titleState,
        hostManagedTransitions: true, random: Math.random,
        surfaceFactory: createSoftwareSurface,
        timingCompatibility: createTimingCompatibility(),
    });
    let frameId = null;
    let lastTime = 0;
    let carryMs = 0;
    let finished = false;
    // Skip already-visited route segments; their scene scripts prime shared TTM
    // resources, while the selected segment is the animation the visitor sees.
    const preview = runtime.state.childScenePreview;
    const prefixLength = preview.route?.length ?? 1;
    for (let ticks = 0; (preview.index || 0) < prefixLength - 1 && ticks < 12000; ticks++) {
        const result = runtime.tick(DGDS_TICK_MS);
        presenter.present(runtime.state, result.presentation);
        // Keep the last visible pose from the route before this segment. Many
        // child scenes draw only an accessory or effect; their actor pose came
        // from the immediately preceding TTM child.
        if (runtime.state.surface.bounds) {
            heldContext.clearRect(0, 0, 640, 480);
            heldContext.drawImage(foreground, 0, 0);
        }
        if (result.completed) break;
    }
    presenter.clear();
    let actorDrawn = false;
    const updateHeldPose = () => {
        if (actorDrawn || !preview.route?.length || preview.route.length < 2) return;
        const pixels = foregroundContext.getImageData(0, 0, 640, 480).data;
        let opaque = 0;
        for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] && ++opaque > 400) {
                actorDrawn = true;
                heldFrame.style.visibility = 'hidden';
                break;
            }
        }
    };
    const frame = (now) => {
        if (!lastTime) lastTime = now;
        carryMs += Math.min(100, now - lastTime);
        lastTime = now;
        let ticks = 0;
        while (carryMs >= DGDS_TICK_MS && ticks < 5 && !finished) {
            carryMs -= DGDS_TICK_MS;
            ticks++;
            try {
                const result = runtime.tick(DGDS_TICK_MS);
                presenter.present(runtime.state, result.presentation);
                updateHeldPose();
                finished = result.completed;
            } catch {
                finished = true;
                onError?.();
            }
        }
        if (!finished) frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return {
        destroy() {
            if (frameId !== null) cancelAnimationFrame(frameId);
            background.remove();
            heldFrame.remove();
            foreground.remove();
        },
    };
}
