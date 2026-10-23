// Slow scalar reference for test-pattern radiance. Never used in the animation loop.
export function lineRadiance(x, footprint, settings, sample, count = 512, radius = 8) {
    let light = 0;
    for (let i = 0; i < count; i++) {
        const point = x + ((i + 0.5) / count - 0.5) * footprint;
        let signal = 0, total = 0;
        for (let j = -radius; j <= radius + 1; j++) {
            const column = Math.floor(point) + j;
            const weight = Math.exp(-0.5 * ((point - column) / settings.horizontal) ** 2);
            const value = sample(column);
            signal += weight * (settings.input === 'srgb' ? decodeSrgb(value) : value); total += weight;
        }
        signal /= total;
        light += settings.input === 'srgb' ? signal : signal ** settings.gamma;
    }
    return light / count;
}
export const decodeSrgb = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
export const encodeSrgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
