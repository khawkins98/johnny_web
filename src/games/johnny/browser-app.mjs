import { runBrowserPresentation } from '../../bottle/browser-presentation.mjs';
import { setupDebugUI } from '../../bottle/debug-ui.mjs';
import { johnnyCastaway } from './manifest.mjs';
import { setupEnhancedUI } from './ui/enhanced.mjs';
import { setupSettingsUI, SOUND_SETTING_KEY } from './ui/settings.mjs';
import { setupSceneFlowPanel } from './ui/scene-flow-panel.mjs';
import { setupShareLink } from './ui/share-link.mjs';
import { createHolidayOverlay, HOLIDAY_SETTING_KEY, HOLIDAY_THEME_OPTIONS } from './ui/holidays.mjs';
import { createJohnnyStoryController } from './story-controller.mjs';
import { runJohnnySequenceTransition } from './ui/transitions.mjs';
import { runJohnnyWalk, runJohnnyPose } from './walking.mjs';
import { createJohnnySelectionPresenter } from './island-presenter.mjs';
import { bandForGag, gagFacts } from './story-steps.mjs';

// A time of day asked for from outside (a shared link, a pasted hash) may be one this gag cannot
// play at, or not a time at all. Whatever the route, the story only ever gets one it can show.
const withPlayableBand = (script, tagId, options) =>
    (options?.band == null ? options : { ...options, band: bandForGag(gagFacts({ script, tagId }), options.band) });

export const runJohnnyCastaway = () => {
    const story = createJohnnyStoryController();
    return runBrowserPresentation({
        game: johnnyCastaway,
        setupDebugUI,
        setupEnhancedUI,
        setupSettingsUI,
        // The Timeline, plus the address bar following what is playing (same story tools).
        setupSceneFlowUI: (options) => {
            const panel = setupSceneFlowPanel(options);
            const share = setupShareLink({ sequenceTools: options?.sequenceTools });
            return { ...panel, destroy: () => { share.destroy(); panel.destroy(); } };
        },
        soundSettingKey: SOUND_SETTING_KEY,
        createBackgroundDecorator: createHolidayOverlay,
        selectScene: () => story.next(),
        runSequenceTransition: runJohnnySequenceTransition,
        runInterlude: runJohnnyWalk,
        runPose: runJohnnyPose,
        createSelectionPresenter: createJohnnySelectionPresenter,
        configureStoryRandom: (source) => story.setRandomSource(source),
        debugThemes: {
            label: 'Holiday Theme',
            storageKey: HOLIDAY_SETTING_KEY,
            options: HOLIDAY_THEME_OPTIONS,
        },
        debugSequence: {
            preview: (script, tagId, options) => story.preview(script, tagId, withPlayableBand(script, tagId, options)),
            planFrom: (script, tagId, options) => story.planFrom(script, tagId, withPlayableBand(script, tagId, options)),
            returnToLive: () => story.returnToLive(),
            holdPlace: (kind) => story.holdPlace(kind),
            keepVisit: (options) => story.keepVisit(options),
            clearRun: () => story.clearRun(),
            status: () => story.status(),
            snapshot: () => story.snapshot(),
            subscribeStatus: (listener) => story.subscribeStatus(listener),
            describe: (script, tagId) => story.describe(script, tagId),
            // Story-day API consumed by the Settings "Story" section + the dev panel.
            getStoryDay: () => story.getStoryDay(),
            getStartTime: () => story.getStartTime(),
            setStoryDay: (day) => story.setStoryDay(day),
            advanceStoryDay: () => story.advanceStoryDay(),
            resetStory: () => story.resetStory(),
        },
    });
};
