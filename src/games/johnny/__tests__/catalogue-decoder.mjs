// Test-support decoder for the binary 79-record scene catalogue in SCRANTIC.SCR.
// The shipped JOHNNY_SCENES is a hand-maintained port; the oracle test decodes the
// binary here and asserts they match, so a transcription slip fails CI.
//
// Catalogue at file offset 0x19556, 17-byte (0x11) stride. The first record is a
// header sentinel (groupId 200); 79 real scene records follow; the table ends at a
// record whose word@0 == 0. Layout per docs/scrantic-re-findings.md / phase2.
export const CATALOGUE_OFFSET = 0x19556;
export const RECORD_STRIDE = 0x11;

// adsId byte -> ADS filename. 0xFF = pure-pose (no ADS).
export const ADS_NAMES = {
    0x65: 'ACTIVITY.ADS',
    0x66: 'BUILDING.ADS',
    0x68: 'FISHING.ADS',
    0x69: 'JOHNNY.ADS',
    0x6a: 'MARY.ADS',
    0x6b: 'MISCGAG.ADS',
    0x6c: 'STAND.ADS',
    0x6d: 'SUZY.ADS',
    0x6e: 'VISITOR.ADS',
    0x6f: 'WALKSTUF.ADS',
};

// Binary spot is 1-based (0 = none, 1 = A .. 6 = G). JOHNNY_SCENES uses 0-based
// (A = 0 .. G = 5) with null for "none". Heading is 0..7 in both (0=S..7=SE).
export const spotToZeroBased = (spot) => (spot === 0 ? null : spot - 1);

export const decodeJohnnyCatalogue = (archiveBuffer) => {
    const dv = new DataView(archiveBuffer);
    const records = [];
    let off = CATALOGUE_OFFSET;
    for (let i = 0; i < 200; i++) {
        const groupId = dv.getUint16(off, true);
        if (groupId === 0 && i > 0) break;
        if (groupId !== 200) {
            const adsId = dv.getUint8(off + 0x0f);
            const pose = adsId === 0xff;
            records.push({
                groupId,
                weight: dv.getUint8(off + 0x02),
                startSpot: spotToZeroBased(dv.getUint8(off + 0x03)),
                startHeading: dv.getUint8(off + 0x04),
                endSpot: spotToZeroBased(dv.getUint8(off + 0x05)),
                endHeading: dv.getUint8(off + 0x06),
                width: dv.getUint8(off + 0x07),
                tideMin: dv.getUint8(off + 0x08),
                tideMax: dv.getUint8(off + 0x09),
                day: dv.getUint8(off + 0x0a),
                adsId,
                adsTag: dv.getUint8(off + 0x10),
                script: pose ? 'POSE' : ADS_NAMES[adsId],
                pose,
            });
        }
        off += RECORD_STRIDE;
    }
    return records;
};
