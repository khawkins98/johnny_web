import { runBrowserPresentation } from '../../bottle/browser-presentation.mjs';
import { setupDebugUI } from '../../bottle/debug-ui.mjs';
import { johnnyCastaway } from './manifest.mjs';
import { setupEnhancedUI } from './ui/enhanced.mjs';
import { setupSettingsUI, SOUND_SETTING_KEY } from './ui/settings.mjs';
import { createHolidayOverlay, HOLIDAY_SETTING_KEY, HOLIDAY_THEME_OPTIONS } from './ui/holidays.mjs';
import { createJohnnyStoryController } from './story-controller.mjs';
import { runJohnnySequenceTransition } from './ui/transitions.mjs';
import { runJohnnyWalk } from './walking.mjs';

export const runJohnnyCastaway = () => {
    const story = createJohnnyStoryController();
    return runBrowserPresentation({
        game: johnnyCastaway,
        setupDebugUI,
        setupEnhancedUI,
        setupSettingsUI,
        soundSettingKey: SOUND_SETTING_KEY,
        createBackgroundDecorator: createHolidayOverlay,
        selectScene: () => story.next(),
        runSequenceTransition: runJohnnySequenceTransition,
        runInterlude: runJohnnyWalk,
        debugThemes: {
            label: 'Holiday Theme',
            storageKey: HOLIDAY_SETTING_KEY,
            options: HOLIDAY_THEME_OPTIONS,
        },
    });
};
