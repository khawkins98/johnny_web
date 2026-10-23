/** Experimental policy: dimensions are CSS pixels; dpr includes desktop page zoom. */
export function resolveScale(width, height, dpr, mode = 'auto') {
    const fit = Math.min(Math.floor(width * dpr) / (640 * dpr), Math.floor(height * dpr) / (480 * dpr));
    const multiplier = Math.floor(fit * dpr + 1e-10);
    const requested = mode === 'native' ? 1 : Number(mode);
    const scale = mode === 'auto' ? (multiplier >= 1 ? multiplier / dpr : fit)
        : (mode === 'fit' || mode === 'legacy') ? fit : Math.min(requested, fit);
    const sharp = mode === 'legacy' || mode !== 'fit' && Math.abs(scale * dpr - Math.round(scale * dpr)) < 1e-8 && scale * dpr >= 1;
    return { scale, sharp, width: 640 * scale, height: 480 * scale,
        x: Math.round((width - 640 * scale) * dpr / 2) / dpr,
        y: Math.round((height - 480 * scale) * dpr / 2) / dpr };
}
