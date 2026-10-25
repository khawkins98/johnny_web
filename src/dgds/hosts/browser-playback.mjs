/** Session-level browser controls shared by ADS, walks, poses and wipes. No script state. */
export function createPlaybackControl({ now = () => performance.now() } = {}) {
    let paused = false,
        rate = 1;
    const listeners = new Set();
    const notify = () => {
        for (const listener of listeners) listener({ paused, rate });
    };
    const control = {
        get paused() {
            return paused;
        },
        get rate() {
            return rate;
        },
        setPaused(value) {
            if (paused !== Boolean(value)) {
                paused = Boolean(value);
                notify();
            }
        },
        setRate(value) {
            if (!Number.isFinite(value)) return;
            const next = Math.max(0.25, Math.min(4, value));
            if (rate !== next) {
                rate = next;
                notify();
            }
        },
        reset() {
            paused = false;
            rate = 1;
            notify();
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        wait(milliseconds, { signal } = {}) {
            return new Promise((resolve) => {
                if (signal?.aborted) return resolve(false);
                let remaining = milliseconds,
                    timer = null,
                    previous = now(),
                    previousPaused = paused,
                    previousRate = rate,
                    done = false;
                const finish = (completed) => {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    unsubscribe();
                    signal?.removeEventListener('abort', abort);
                    resolve(completed);
                };
                const update = () => {
                    clearTimeout(timer);
                    const time = now();
                    if (!previousPaused) remaining -= Math.max(0, time - previous) * previousRate;
                    previous = time;
                    previousPaused = paused;
                    previousRate = rate;
                    if (!paused) timer = setTimeout(() => finish(true), Math.max(0, remaining) / rate);
                };
                const abort = () => finish(false);
                const unsubscribe = control.subscribe(update);
                signal?.addEventListener('abort', abort, { once: true });
                update();
            });
        },
    };
    return control;
}
export const browserPlayback = createPlaybackControl();
