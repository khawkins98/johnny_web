import { describe, expect, it, vi } from 'vitest';
import {
    decodeJohnnyWalkData,
    johnnyPoseFrame,
    planJohnnyWalkFrames,
    runJohnnyPose,
    runJohnnyWalk,
    selectJohnnyWalkPath,
} from '../walking.mjs';

describe('Johnny host walking', () => {
    it('decodes flip, frame and coordinates directly from SCRANTIC.SCR layout', () => {
        const archive = new ArrayBuffer(0x188ea + 480 * 6);
        const view = new DataView(archive);
        view.setUint16(0x188ea, 0x8013, true);
        view.setUint16(0x188ec, 306, true);
        view.setUint16(0x188ee, 238, true);
        expect(decodeJohnnyWalkData(archive)[0]).toEqual({ flipX: true, frame: 18, x: 306, y: 238 });
    });

    it('uses host bookmarks to join scene endpoints', () => {
        const data = Array.from({ length: 480 }, () => ({ flipX: false, frame: -1, x: 0, y: 0 }));
        data[68] = { flipX: false, frame: 3, x: 10, y: 20 };
        data[69] = { flipX: false, frame: -1, x: 0, y: 0 };
        for (let heading = 0; heading < 8; heading++) {
            data[91 + heading] = { flipX: false, frame: heading, x: 1, y: 2 };
            data[145 + 9 + heading] = { flipX: false, frame: heading, x: 3, y: 4 };
        }
        const frames = planJohnnyWalkFrames(
            { fromSpot: 0, fromHeading: 6, toSpot: 1, toHeading: 7 },
            data,
            () => 0,
        );
        expect(frames).toContain(data[68]);
        expect(frames.at(-1)).toBe(data[145 + 9 + 7]);
    });

    it('shows the current standing pose through a same-spot turn to a hold-sentinel heading', () => {
        // A stationary turn (fromSpot === toSpot) whose destination heading has a
        // "hold" sentinel sprite (frame -1, e.g. the pure W/E facings in the real
        // table) must not resolve to an all-invisible sequence: the original draws
        // Johnny's CURRENT heading standing pose before turning, so there is always
        // a visible sprite to hold. Regression: Johnny vanished for the interlude.
        const TURNS_SPOT_3 = 314;
        const data = Array.from({ length: 480 }, () => ({ flipX: false, frame: -1, x: 0, y: 0 }));
        // Standing pose facing heading 1 (SW) is a real sprite; heading 2 (W) is a
        // hold sentinel -- exactly the recovered table's shape for spot C.
        data[TURNS_SPOT_3 + 9 + 1] = { flipX: false, frame: 16, x: 5, y: 6 };
        data[TURNS_SPOT_3 + 9 + 2] = { flipX: true, frame: -1, x: 5, y: 6 };

        const frames = planJohnnyWalkFrames(
            { fromSpot: 3, fromHeading: 1, toSpot: 3, toHeading: 2 },
            data,
            () => 0,
        );

        expect(frames.length).toBeGreaterThan(0);
        // At least one planned frame is a real, drawable sprite (not a -1 hold).
        expect(frames.some((frame) => frame.frame >= 0)).toBe(true);
        // The first planned frame is the current-heading standing pose, so the
        // retain-on-invisible path always has a sprite to hold.
        expect(frames[0].frame).toBeGreaterThanOrEqual(0);
    });

    it('selects among non-repeating routes instead of always taking the shortest path', () => {
        const first = selectJohnnyWalkPath(0, 3, () => 0);
        const last = selectJohnnyWalkPath(0, 3, () => 0.999999);

        expect(first[0]).toBe(0);
        expect(first.at(-1)).toBe(3);
        expect(new Set(first).size).toBe(first.length);
        expect(last[0]).toBe(0);
        expect(last.at(-1)).toBe(3);
        expect(new Set(last).size).toBe(last.length);
        expect(last).not.toEqual(first);
    });

    it('handles same, invalid, and extreme random path selections deterministically', () => {
        expect(selectJohnnyWalkPath(2, 2, () => 0.5)).toEqual([2]);
        expect(selectJohnnyWalkPath(-1, 2, () => 0.5)).toEqual([]);
        expect(selectJohnnyWalkPath(0, 1, () => 1).at(-1)).toBe(1);
        expect(selectJohnnyWalkPath(0, 1, () => -1).at(-1)).toBe(1);
    });

    it('redraws the persistent island behind every walking frame', async () => {
        const archiveBuffer = new ArrayBuffer(0x188ea + 480 * 6);
        new DataView(archiveBuffer).setUint16(0x188ea + 100 * 6, 1, true);
        const context = {
            clearRect: vi.fn(),
            save: vi.fn(),
            restore: vi.fn(),
            drawImage: vi.fn(),
        };
        const presentBackground = vi.fn();
        const wait = vi.fn(() => Promise.resolve());
        await runJohnnyWalk({
            walk: { fromSpot: 0, fromHeading: 0, toSpot: 0, toHeading: 0 },
            titleState: { x: 0, y: 0 },
            archiveBuffer,
            resourceProvider: {
                resolve: (name) =>
                    name === 'JOHNWALK.BMP'
                        ? {
                              images: [
                                  {
                                      width: 1,
                                      height: 1,
                                      pixels: [{ r: 0, g: 0, b: 0, a: 255 }],
                                      _canvas: {},
                                  },
                              ],
                          }
                        : { images: [] },
            },
            context,
            presentBackground,
            wait,
        });

        expect(presentBackground).toHaveBeenCalledOnce();
        expect(wait).toHaveBeenCalledWith(1600, { signal: null });
        expect(context.clearRect).toHaveBeenCalledOnce();
    });

    it('clears and stops before later frames when its host attempt is aborted', async () => {
        const archiveBuffer = new ArrayBuffer(0x188ea + 480 * 6);
        const context = { clearRect: vi.fn() };
        const controller = new AbortController();
        const wait = vi.fn(async () => {
            controller.abort();
        });

        const completed = await runJohnnyWalk({
            walk: { fromSpot: 0, fromHeading: 0, toSpot: 0, toHeading: 0 },
            titleState: { x: 0, y: 0 },
            archiveBuffer,
            resourceProvider: { resolve: () => ({ images: [] }) },
            context,
            wait,
            signal: controller.signal,
        });

        expect(completed).toBe(false);
        expect(wait).toHaveBeenCalledOnce();
        expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 640, 480);
    });

    it('retains the previous frame when a walking sprite is fully transparent', async () => {
        const archiveBuffer = new ArrayBuffer(0x188ea + 480 * 6);
        const view = new DataView(archiveBuffer);
        view.setUint16(0x188ea + 68 * 6, 1, true);
        const context = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() };
        const record = vi.fn();
        const transparent = { width: 1, height: 1, pixels: [{ r: 0, g: 0, b: 0, a: 0 }] };

        await runJohnnyWalk({
            walk: { fromSpot: 0, fromHeading: 6, toSpot: 1, toHeading: 7 },
            archiveBuffer,
            resourceProvider: { resolve: (name) => (name === 'JOHNWALK.BMP' ? { images: [transparent] } : null) },
            context,
            wait: async () => true,
            random: () => 0,
            record,
        });

        expect(context.clearRect).not.toHaveBeenCalled();
        expect(context.drawImage).not.toHaveBeenCalled();
        expect(record).toHaveBeenCalledWith('walk-frame', expect.objectContaining({ visible: false }));
    });

    it('resolves a pose to the standing sprite row for its spot and heading', () => {
        // TURNS[spot] + 9 (the waiting/standing block) + heading -- e.g. spot A (0)
        // facing NW (3) -> row 91 + 9 + 3 = 103.
        const data = Array.from({ length: 480 }, (_, i) => ({ flipX: false, frame: -1, x: 0, y: 0, row: i }));
        expect(johnnyPoseFrame(data, 0, 3)).toBe(data[103]);
        expect(johnnyPoseFrame(data, 5, 0)).toBe(data[471 + 9]); // spot G, heading S
    });

    it('stands Johnny using the correct standing-sprite index for the pose spot/heading (no ADS)', async () => {
        // Sprite rasterization needs a real canvas (unavailable headless), so assert
        // the resolved standing frame INDEX for the spot/heading, not the pixel draw:
        // spot A (0) facing NW (3) -> walk row 91+9+3=103 -> frame value 6 => index 5.
        const archiveBuffer = new ArrayBuffer(0x188ea + 480 * 6);
        const view = new DataView(archiveBuffer);
        view.setUint16(0x188ea + 103 * 6, 6, true);
        view.setUint16(0x188ea + 103 * 6 + 2, 480, true); // x
        view.setUint16(0x188ea + 103 * 6 + 4, 298, true); // y
        const context = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() };
        const record = vi.fn();

        const done = await runJohnnyPose({
            pose: { spot: 0, heading: 3 },
            titleState: { x: 0, y: 0 },
            archiveBuffer,
            resourceProvider: { resolve: () => ({ images: [] }) },
            context,
            wait: async () => true,
            record,
        });

        expect(done).toBe(true);
        expect(record).toHaveBeenCalledWith(
            'pose-frame',
            expect.objectContaining({ spot: 0, heading: 3, frame: 5, x: 480, y: 298 }),
        );
    });

    it('retains the canvas for a pose whose standing sprite is the hold sentinel (W/E facings)', async () => {
        // row 103 left at frame -1 (value 0) -> invisible hold sentinel.
        const archiveBuffer = new ArrayBuffer(0x188ea + 480 * 6);
        const context = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() };
        const record = vi.fn();

        await runJohnnyPose({
            pose: { spot: 0, heading: 3 },
            archiveBuffer,
            resourceProvider: { resolve: () => ({ images: [] }) },
            context,
            wait: async () => true,
            record,
        });

        expect(context.clearRect).not.toHaveBeenCalled();
        expect(context.drawImage).not.toHaveBeenCalled();
        expect(record).toHaveBeenCalledWith('pose-frame', expect.objectContaining({ visible: false }));
    });
});
