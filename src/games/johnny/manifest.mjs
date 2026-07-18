/**
 * Johnny Castaway v1.01 (International, 1993-04) game package.
 *
 * This module contains title/version knowledge. Generic DGDS parsers, runtime,
 * and host adapters must receive these values rather than importing them.
 */
export const johnnyCastaway = Object.freeze({
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
        oceans: Object.freeze([
            'OCEAN00.SCR',
            'OCEAN01.SCR',
            'OCEAN02.SCR',
            'NIGHT.SCR',
        ]),
        layouts: Object.freeze({
            1: Object.freeze({ x: 288 }),
            2: Object.freeze({ x: 16 }),
        }),
        cloud: Object.freeze({
            source: 'bkgRes',
            frames: Object.freeze([15, 16, 17]),
        }),
        layers: Object.freeze([
            Object.freeze({ source: 'bkgRaft', frame: 3, x: 222, y: 268 }),
            Object.freeze({ source: 'bkgRes', frame: 0, x: 0, y: 280 }),
            Object.freeze({ source: 'bkgRes', frame: 14, x: 108, y: 280 }),
            Object.freeze({ source: 'bkgRes', frame: 13, x: 154, y: 148 }),
            Object.freeze({ source: 'bkgRes', frame: 12, x: 77, y: 122 }),
        ]),
        animatedLayers: Object.freeze([
            Object.freeze({ source: 'bkgRes', frames: Object.freeze([3, 4, 5]), x: -13, y: 305 }),
            Object.freeze({ source: 'bkgRes', frames: Object.freeze([6, 7, 8, 9]), x: 76, y: 320 }),
            Object.freeze({ source: 'bkgRes', frames: Object.freeze([10, 11]), x: 230, y: 303 }),
        ]),
        settings: Object.freeze({
            clouds: 'jc-clouds',
            waves: 'jc-waves',
            time: 'jc-time',
        }),
    }),
    audio: Object.freeze({
        archive: 'SCRANTIC.SCR',
        sampleOffsets: Object.freeze([
            -1,
            0x1DC00, 0x20800, 0x20E00,
            0x22C00, 0x24000, 0x24C00,
            0x28A00, 0x2C600, 0x2D000,
            0x2DE00,
            -1, 0x34400, 0x32E00,
            0x39C00, 0x43400, 0x37200,
            0x37E00, 0x45A00, 0x3AE00,
            0x3E600, 0x3F400, 0x41200,
            0x42600, 0x42C00, 0x43400,
        ]),
    }),
});
