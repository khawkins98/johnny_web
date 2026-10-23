export const vgaDefaults = { horizontal: 0.35, beam: 0.32, growth: 0.06, gamma: 2.2, phase: 0.25, exposure: 0.9, mask: 0, triads: 640, input: 'drive', bypass: false };
export const vgaRanges = { horizontal: [0.2, 0.8], beam: [0.18, 0.55], growth: [0, 0.15], gamma: [1.8, 2.6], phase: [-0.5, 0.5], exposure: [0.5, 1.2], mask: [0, 0.35], triads: [320, 960] };
export function sanitizeVga(input) {
    return { ...Object.fromEntries(Object.entries(vgaRanges).map(([key, [min, max]]) => [key,
        Number.isFinite(input?.[key]) ? Math.max(min, Math.min(max, input[key])) : vgaDefaults[key]])),
        input: input?.input === 'srgb' ? 'srgb' : 'drive', bypass: input?.bypass === true };
}
export function maskVisibility(width, triads) {
    const density = width / triads, t = Math.max(0, Math.min(1, (density - 3) / 3));
    return t * t * (3 - 2 * t);
}
