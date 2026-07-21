/**
 * Johnny Castaway v1.01 (International, 1993-04) game package.
 *
 * This module contains title/version knowledge. Generic DGDS parsers, runtime,
 * and host adapters must receive these values rather than importing them.
 */
import { defineGamePackage } from '../../bottle/game-package.mjs';

export const johnnyCastaway = defineGamePackage({
    id: 'johnny-castaway',
    title: 'Johnny Castaway',
    version: '1.01-international',
    resources: Object.freeze({
        map: 'RESOURCE.MAP',
        archive: 'RESOURCE.001',
        intro: 'INTRO.SCR',
        activity: 'ACTIVITY.ADS',
        aliases: Object.freeze({
            'FLAME.BMP': 'FIRE1.BMP',
            'FLURRY.BMP': 'FIRE1.BMP',
        }),
    }),
    background: Object.freeze({
        screens: Object.freeze({
            'ISLETEMP.SCR': 1,
            'ISLAND2.SCR': 2,
            'SUZBEACH.SCR': 0,
            'JOFFICE.SCR': 0,
            'THEEND.SCR': 0,
            'INTRO.SCR': 0,
        }),
        assets: Object.freeze([
            Object.freeze({ stateKey: 'bkgRes', name: 'BACKGRND.BMP' }),
            Object.freeze({ stateKey: 'bkgRaft', name: 'MRAFT.BMP' }),
        ]),
        oceans: Object.freeze(['OCEAN00.SCR', 'OCEAN01.SCR', 'OCEAN02.SCR', 'NIGHT.SCR']),
        layouts: Object.freeze({
            1: Object.freeze({ x: 288 }),
            2: Object.freeze({ x: 16 }),
        }),
        cloud: Object.freeze({
            source: 'bkgRes',
            frames: Object.freeze([15, 16, 17]),
        }),
        layers: Object.freeze([
            Object.freeze({ source: 'bkgRes', frame: 0, x: 0, y: 279 }),
            Object.freeze({ source: 'bkgRes', frame: 14, x: 108, y: 279 }),
            Object.freeze({ source: 'bkgRes', frame: 13, x: 154, y: 148 }),
            Object.freeze({ source: 'bkgRes', frame: 12, x: 77, y: 122 }),
        ]),
        raft: Object.freeze({
            source: 'bkgRaft',
            high: Object.freeze({ x: 224, y: 266 }),
            low: Object.freeze({ x: 241, y: 281 }),
        }),
        tides: Object.freeze({
            high: Object.freeze({
                staticLayers: Object.freeze([]),
                waves: Object.freeze([
                    Object.freeze({ source: 'bkgRes', frames: Object.freeze([3, 4, 5]), x: -18, y: 306 }),
                    Object.freeze({ source: 'bkgRes', frames: Object.freeze([6, 7, 8]), x: 76, y: 319 }),
                    Object.freeze({ source: 'bkgRes', frames: Object.freeze([9, 10, 11]), x: 230, y: 303 }),
                ]),
            }),
            low: Object.freeze({
                staticLayers: Object.freeze([
                    Object.freeze({ source: 'bkgRes', frame: 1, x: -39, y: 303 }),
                    Object.freeze({ source: 'bkgRes', frame: 2, x: -138, y: 328 }),
                ]),
                waves: Object.freeze([
                    Object.freeze({ source: 'bkgRes', frames: Object.freeze([30, 31, 32]), x: -55, y: 323 }),
                    Object.freeze({ source: 'bkgRes', frames: Object.freeze([33, 34, 35]), x: 79, y: 356 }),
                    Object.freeze({ source: 'bkgRes', frames: Object.freeze([36, 37, 38]), x: 270, y: 323 }),
                    Object.freeze({ source: 'bkgRes', frames: Object.freeze([39, 40, 41]), x: -159, y: 340 }),
                ]),
            }),
        }),
        settings: Object.freeze({
            clouds: 'jc-clouds',
            waves: 'jc-waves',
            time: 'jc-time',
        }),
    }),
    audio: Object.freeze({
        archive: 'SCRANTIC.SCR',
        sampleOffsets: Object.freeze([
            -1, 0x1dc00, 0x20800, 0x20e00, 0x22c00, 0x24000, 0x24c00, 0x28a00, 0x2c600, 0x2d000, 0x2de00, -1, 0x34400,
            0x32e00, 0x39c00, 0x43400, 0x37200, 0x37e00, 0x45a00, 0x3ae00, 0x3e600, 0x3f400, 0x41200, 0x42600, 0x42c00,
            0x43400,
        ]),
    }),
});
