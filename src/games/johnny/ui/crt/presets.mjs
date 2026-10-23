// Values are source-pixel radii or unitless gains. No game state belongs here.
export const limits = { blur: 2, bleed: 4, bloom: 1, scanlines: 0.5, curvature: 0.3, vignette: 0.6 };
export const presets = {
    subtle: { blur: 0.5, bleed: 0, bloom: 0, scanlines: 0.12, curvature: 0, vignette: 0 },
    balanced: { blur: 1, bleed: 0.7, bloom: 0.08, scanlines: 0.10, curvature: 0.01, vignette: 0.05 },
    soft: { blur: 0.9, bleed: 1.5, bloom: 0.18, scanlines: 0.15, curvature: 0.08, vignette: 0.12 },
    neutral: { blur: 0, bleed: 0, bloom: 0, scanlines: 0, curvature: 0, vignette: 0 },
};
export function sanitizeSettings(input = {}) {
    return { bypass: input?.bypass === true, ...Object.fromEntries(Object.entries(limits).map(([key, max]) =>
        [key, typeof input?.[key] === 'number' && Number.isFinite(input[key]) ? Math.min(max, Math.max(0, input[key])) : 0])) };
}
export function readStored(storage, key, fallback) {
    try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeStored(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export const PRESET_KEY = 'jc-crt-presets-v1';
export function readPresets(storage) {
    const raw = readStored(storage, PRESET_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 20).filter(p => typeof p?.name === 'string' && p.name.trim()).map(p =>
        ({ name: p.name.trim().slice(0, 40), settings: sanitizeSettings(p.settings) }));
}
