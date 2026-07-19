import { runBrowserPresentation } from '../../bottle/browser-presentation.mjs';
import { setupDebugUI } from '../../bottle/debug-ui.mjs';
import { johnnyCastaway } from './manifest.mjs';
import { setupEnhancedUI } from './ui/enhanced.mjs';
import { setupSettingsUI, SOUND_SETTING_KEY } from './ui/settings.mjs';
import { createHolidayOverlay, HOLIDAY_SETTING_KEY, HOLIDAY_THEME_OPTIONS } from './ui/holidays.mjs';
import { createJohnnySceneSelector } from './scene-selector.mjs';

export const runJohnnyCastaway = () =>
    runBrowserPresentation({
        game: johnnyCastaway,
        setupDebugUI,
        setupEnhancedUI,
        setupSettingsUI,
        soundSettingKey: SOUND_SETTING_KEY,
        createBackgroundDecorator: createHolidayOverlay,
        selectScene: createJohnnySceneSelector(),
        debugThemes: {
            label: 'Holiday Theme',
            storageKey: HOLIDAY_SETTING_KEY,
            options: HOLIDAY_THEME_OPTIONS,
        },
    });
