import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    decodeJohnnyWalkData,
    johnnyPoseFrame,
    occludeBehindTrunk,
    occludedByTrunk,
    pickWalkSegment,
    planJohnnyWalkFrames,
    runJohnnyPose,
    runJohnnyWalk,
} from '../walking.mjs';

// The real walk-frame table lives in the proprietary, gitignored SCRANTIC.SCR
// (absent in CI). Tests that need it are guarded and skip when it is unavailable,
// like the golden harness; the walk ROUTE/SEGMENT tables are hardcoded so most
// tests use synthetic frame data and need no archive.
const archivePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../public/data', 'SCRANTIC.SCR');
const hasArchive = existsSync(archivePath);
// jsdom provides its own ArrayBuffer realm, so copy the file bytes into a test-realm
// ArrayBuffer (decodeJohnnyWalkData guards on `instanceof ArrayBuffer`, which fails
// cross-realm for a Node fs buffer).
const toArrayBuffer = (buf) => {
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    return ab;
};
const realWalkData = hasArchive ? decodeJohnnyWalkData(toArrayBuffer(readFileSync(archivePath))) : null;

describe('Johnny host walking', () => {
    it('decodes flip, frame and coordinates directly from SCRANTIC.SCR layout', () => {
        const archive = new ArrayBuffer(0x188ea + 488 * 6);
        const view = new DataView(archive);
        view.setUint16(0x188ea, 0x8013, true);
        view.setUint16(0x188ec, 306, true);
        view.setUint16(0x188ee, 238, true);
        expect(decodeJohnnyWalkData(archive)[0]).toEqual({ flipX: true, frame: 18, x: 306, y: 238 });
    });

    it('follows the route matrix: plays a segment then ends at the destination standing pose', () => {
        const data = Array.from({ length: 480 }, () => ({ flipX: false, frame: -1, x: 0, y: 0 }));
        // Segment 4 (the direct A->B route in "12") starts at walk-table row 68.
        data[68] = { flipX: false, frame: 3, x: 10, y: 20 };
        data[69] = { flipX: false, frame: -1, x: 0, y: 0 };
        for (let heading = 0; heading < 8; heading++) {
            data[145 + 9 + heading] = { flipX: false, frame: heading, x: 3, y: 4 }; // spot B standing rows
        }
        // rng 0.99 rolls to the direct A->B segment (seg 4) in route "12".
        const frames = planJohnnyWalkFrames(
            { fromSpot: 0, fromHeading: 6, toSpot: 1, toHeading: 7 },
            data,
            () => 0.99,
        );
        expect(frames).toContain(data[68]); // played the chosen segment's walk frame
        expect(frames.at(-1)).toBe(data[145 + 9 + 7]); // ended at the destination standing pose
    });

    it('roulette-picks a walk segment by weight (rng % 100 over the pairs)', () => {
        expect(pickWalkSegment([[7, 50], [8, 50]], () => 0)).toBe(7);
        expect(pickWalkSegment([[7, 50], [8, 50]], () => 0.99)).toBe(8);
        expect(pickWalkSegment([[13, 100]], () => 0.5)).toBe(13);
        // a roll past the summed weights falls back to the last segment
        expect(pickWalkSegment([[5, 10], [6, 10]], () => 0.99)).toBe(6);
    });

    it('returns no frames for null headings or out-of-range spots', () => {
        const data = Array.from({ length: 480 }, () => ({ flipX: false, frame: -1, x: 0, y: 0 }));
        expect(planJohnnyWalkFrames({ fromSpot: 0, fromHeading: null, toSpot: 1, toHeading: 2 }, data, () => 0)).toEqual([]);
        expect(planJohnnyWalkFrames({ fromSpot: -1, fromHeading: 0, toSpot: 2, toHeading: 0 }, data, () => 0)).toEqual([]);
        expect(planJohnnyWalkFrames({ fromSpot: 0, fromHeading: 0, toSpot: 9, toHeading: 0 }, data, () => 0)).toEqual([]);
    });

    it.skipIf(!hasArchive)('every spot-to-spot walk terminates at the destination standing pose', () => {
        for (let from = 0; from < 6; from++) {
            for (let to = 0; to < 6; to++) {
                if (from === to) continue;
                // deterministic LCG so each pair is reproducible but exercises the roulette
                let seed = (12345 + from * 131 + to * 17) >>> 0;
                const rng = () => {
                    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
                    return seed / 0x100000000;
                };
                const frames = planJohnnyWalkFrames(
                    { fromSpot: from, fromHeading: 0, toSpot: to, toHeading: 3 },
                    realWalkData,
                    rng,
                );
                expect(frames.length, `${from}->${to} empty`).toBeGreaterThan(0);
                // The walk always resolves to the destination's standing pose for the
                // target heading, proving the segment chain reached `to` (not a dead-end).
                expect(frames.at(-1), `${from}->${to} end`).toBe(johnnyPoseFrame(realWalkData, to, 3));
                // Johnny is never all-invisible: at least one real sprite is planned.
                expect(frames.some((f) => f.frame >= 0), `${from}->${to} visible`).toBe(true);
            }
        }
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


    it('redraws the persistent island behind every walking frame', async () => {
        const archiveBuffer = new ArrayBuffer(0x188ea + 488 * 6);
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
        const archiveBuffer = new ArrayBuffer(0x188ea + 488 * 6);
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
        const archiveBuffer = new ArrayBuffer(0x188ea + 488 * 6);
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
        const archiveBuffer = new ArrayBuffer(0x188ea + 488 * 6);
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
        const archiveBuffer = new ArrayBuffer(0x188ea + 488 * 6);
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

    // Palm-trunk occlusion is position/depth-based (the original's generic per-frame
    // re-blit), not a D-to-E spot hardcode, so it covers any route past the tree.
    // Trunk box (matches the port's background layout: layout.x 288 + sprite.x 154):
    // x in [442,464), y in [148,293); base at y=293. Binary overlap (FUN_1010_1a88) is
    // MIN-edge INCLUSIVE; the base gate is strict.
    it('occludes a sprite overlapping the trunk with feet above the base', () => {
        expect(occludedByTrunk(450, 200, 20, 40)).toBe(true); // over the trunk, feet at 240
    });
    it('does not occlude a sprite clear of the trunk box', () => {
        expect(occludedByTrunk(100, 200, 20, 40)).toBe(false); // left of the trunk entirely
    });
    it('does not occlude a sprite whose feet are below the trunk base (in front, closer)', () => {
        expect(occludedByTrunk(450, 260, 20, 40)).toBe(false); // feet at 300 >= 293
    });
    // Boundaries (each is exactly where a wrong inclusivity/strictness would flip):
    it('base gate is strict: feet exactly at the base do NOT occlude', () => {
        expect(occludedByTrunk(450, 253, 20, 40)).toBe(false); // feetY === 293
    });
    it('min x-edge is inclusive: right edge exactly at the trunk left occludes', () => {
        expect(occludedByTrunk(422, 200, 20, 40)).toBe(true); // x+width === 442
    });
    it('max x-edge is exclusive: left edge exactly at the trunk right does not occlude', () => {
        expect(occludedByTrunk(464, 200, 20, 40)).toBe(false); // x === 464 (442+22)
    });
    it('min y-edge is inclusive: feet exactly at the trunk top occlude', () => {
        expect(occludedByTrunk(450, 108, 20, 40)).toBe(true); // feetY === 148
    });
    // The redraw must land exactly on the background trunk (442,148)+offset, so the
    // occluder never doubles the tree -- guard the actual draw call, not just the gate.
    it('redraws the trunk at the background trunk position (442,148)+offset', () => {
        const context = { drawImage: vi.fn() };
        const trunkSprite = { marker: 'trunk' };
        occludeBehindTrunk(context, trunkSprite, { x: 450, y: 200 }, { width: 20, height: 40 }, 100, 50);
        expect(context.drawImage).toHaveBeenCalledWith(trunkSprite, 542, 198); // 442+100, 148+50
    });
    it('does not redraw the trunk when the sprite is clear of it', () => {
        const context = { drawImage: vi.fn() };
        occludeBehindTrunk(context, { marker: 'trunk' }, { x: 100, y: 200 }, { width: 20, height: 40 }, 0, 0);
        expect(context.drawImage).not.toHaveBeenCalled();
    });
});
