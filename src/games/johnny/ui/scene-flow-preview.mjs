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
export function mountSceneFlowPreview({ host, resolveEntry, sequenceTools, script, gagTag, slot, tag, storyDay, onError }) {
    const background = document.createElement('canvas');
    const foreground = document.createElement('canvas');
    for (const canvas of [background, foreground]) {
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
    drawBackground(island, mainContext, policy);
    const presenter = createBrowserFramePresenter({
        context: foreground.getContext('2d'),
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
        childScenePreview: { slot, tag, armed: false },
        resourceProvider, game: johnnyCastaway, titleState,
        hostManagedTransitions: true, random: Math.random,
        surfaceFactory: createSoftwareSurface,
        timingCompatibility: createTimingCompatibility(),
    });
    let frameId = null;
    let lastTime = 0;
    let carryMs = 0;
    let finished = false;
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
            foreground.remove();
        },
    };
}
