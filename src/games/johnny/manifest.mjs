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
