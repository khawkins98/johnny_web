import { runBrowserPresentation } from '../../bottle/browser-presentation.mjs';
import { setupDebugUI } from '../../bottle/debug-ui.mjs';
import { johnnyCastaway } from './manifest.mjs';
import { setupEnhancedUI } from './ui/enhanced.mjs';
import { setupSettingsUI, SOUND_SETTING_KEY } from './ui/settings.mjs';

export const runJohnnyCastaway = () =>
    runBrowserPresentation({
        game: johnnyCastaway,
        setupDebugUI,
        setupEnhancedUI,
        setupSettingsUI,
        soundSettingKey: SOUND_SETTING_KEY,
    });
