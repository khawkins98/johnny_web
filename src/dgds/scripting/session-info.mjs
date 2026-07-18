const appVersion = typeof __JOHNNY_VERSION__ === 'string' ? __JOHNNY_VERSION__ : 'development';
const buildId = typeof __JOHNNY_BUILD__ === 'string' ? __JOHNNY_BUILD__ : 'unknown';

export const createSessionInfo = ({ mode, tick = null } = {}) => {
    const browser = typeof navigator === 'undefined' ? {} : {
        userAgent: navigator.userAgent,
        platform: navigator.userAgentData?.platform || navigator.platform || null,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemoryGiB: navigator.deviceMemory ?? null,
        maxTouchPoints: navigator.maxTouchPoints ?? null,
    };
    const display = typeof window === 'undefined' ? {} : {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: window.screen ? {
            width: window.screen.width,
            height: window.screen.height,
            colorDepth: window.screen.colorDepth,
        } : null,
        devicePixelRatio: window.devicePixelRatio,
    };

    return {
        enabledAt: new Date().toISOString(),
        mode,
        tick,
        application: { name: 'johnny_web', version: appVersion, build: buildId },
        page: typeof location === 'undefined' ? null : location.href,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        browser,
        display,
    };
};
