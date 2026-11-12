/**
 * Counts drawing calls on a 2D canvas, so a reader can tell whether its pixels may have
 * changed without reading them back. The game has many direct writers (scenes, walks,
 * fades, clouds), so the count is taken at the context rather than at each writer.
 *
 * These are all the Canvas 2D methods that change pixels; resizing the canvas also clears
 * it, so callers should compare its dimensions too. Drawing behaviour is unchanged.
 */
const WRITERS = ['clearRect', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'fill', 'stroke', 'drawImage', 'putImageData', 'reset'];
const counters = new WeakMap();

/** Returns a function giving the canvas's current write count. */
export function trackCanvasWrites(canvas) {
    let counter = counters.get(canvas);
    if (!counter) {
        counter = { writes: 0, tracked: false };
        let context = null;
        try { context = canvas.getContext('2d'); } catch { /* Not a 2D canvas. */ }
        if (context) {
            for (const name of WRITERS) {
                const native = context[name];
                if (typeof native !== 'function') continue;
                context[name] = function () { counter.writes++; return native.apply(this, arguments); };
            }
            counter.tracked = true;
        }
        counters.set(canvas, counter);
    }
    // Without a context to observe, report a change every time rather than risk a stale picture.
    return () => (counter.tracked ? counter.writes : ++counter.writes);
}
