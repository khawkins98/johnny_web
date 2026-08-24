import * as fflate from 'fflate';
import { explode } from 'node-pkware/simple';
import { saveFile } from './idb.mjs';

const EXPECTED_ZIP_SHA256 = 'e084d527921708642a79724e9f0210da659bbc0905c6ce9a3a1f416e4628091c';

async function sha256(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// FAT12 File System Constants for 1.44MB Floppy
const FAT12_ROOT_DIR_OFFSET = 9728; // 512 (Boot Sector) + 2 * 9 * 512 (Two FATs)
const FAT12_DATA_REGION_OFFSET = 16896; // 9728 + 14 * 512 (Root Directory)
const SECTOR_SIZE = 512;
const MAX_ROOT_ENTRIES = 224;
const DIR_ENTRY_SIZE = 32;

function extractFromFAT12(imaBuffer) {
    const ima = new Uint8Array(imaBuffer);
    const files = {};

    for (let i = 0; i < MAX_ROOT_ENTRIES; i++) {
        const entryOffset = FAT12_ROOT_DIR_OFFSET + i * DIR_ENTRY_SIZE;
        const firstByte = ima[entryOffset];
        if (firstByte === 0x00) break; // end of dir
        if (firstByte === 0xE5) continue; // deleted

        const attr = ima[entryOffset + 11];
        if (attr & 0x08) continue; // volume label
        if (attr & 0x10) continue; // directory

        let name = '';
        for (let j = 0; j < 8; j++) name += String.fromCharCode(ima[entryOffset + j]);
        let ext = '';
        for (let j = 0; j < 3; j++) ext += String.fromCharCode(ima[entryOffset + 8 + j]);
        name = name.trim();
        ext = ext.trim();
        const fullName = ext ? `${name}.${ext}` : name;

        // Start cluster (Little Endian)
        const startCluster = ima[entryOffset + 26] | (ima[entryOffset + 27] << 8);

        // File size (Little Endian)
        const fileSize =
            ima[entryOffset + 28] |
            (ima[entryOffset + 29] << 8) |
            (ima[entryOffset + 30] << 16) |
            (ima[entryOffset + 31] << 24);

        if (['RESOURCE.MAP', 'SCRANTIC.SC$', 'RESOURCE.00$'].includes(fullName)) {
            // Files are contiguous on this specific mastered floppy image.
            // A robust FAT12 parser would follow the cluster chain.
            const dataOffset = FAT12_DATA_REGION_OFFSET + (startCluster - 2) * SECTOR_SIZE;
            files[fullName] = ima.slice(dataOffset, dataOffset + fileSize);
        }
    }
    return files;
}

/**
 * Decompress a TSComp-wrapped PKWARE-implode file.
 *
 * TSComp header (magic 65 5D 13 8C):
 *   0–3   magic
 *   4–7   version/flags
 *   8–11  file count (LE uint32)
 *   12–27 per-archive metadata (unused here)
 *   28    original filename length
 *   29…   filename (ASCII) + null terminator
 *   42    start of PKWARE implode compressed stream
 */
function decompressTSComp(buf) {
    const nameLen = buf[28];
    const dataStart = 29 + nameLen + 1;
    // PKWARE implode in browser
    return explode(buf.slice(dataStart).buffer);
}

export const extractArchiveToIndexedDB = async (buffer, filename, onProgress) => {
    let imaBuffer = null;
    const isZip = filename.toLowerCase().endsWith('.zip');

    if (isZip) {
        onProgress('Verifying ZIP hash...');
        const hash = await sha256(buffer);
        if (hash !== EXPECTED_ZIP_SHA256) {
            console.warn(`Unverified ZIP hash: got ${hash}, expected ${EXPECTED_ZIP_SHA256}. Attempting extraction anyway.`);
        }

        onProgress('Extracting floppy image from ZIP...');
        const unzipped = fflate.unzipSync(new Uint8Array(buffer));
        for (const [name, data] of Object.entries(unzipped)) {
            if (name.toLowerCase().endsWith('.ima') || name.toLowerCase().endsWith('.img')) {
                imaBuffer = data;
                break;
            }
        }

        if (!imaBuffer) throw new Error('No .ima/.img floppy image found inside ZIP.');
    } else {
        imaBuffer = buffer;
    }

    onProgress('Parsing FAT12 floppy image...');
    const fatFiles = extractFromFAT12(imaBuffer);
    if (!fatFiles['RESOURCE.MAP'] || !fatFiles['SCRANTIC.SC$'] || !fatFiles['RESOURCE.00$']) {
        throw new Error('Could not find required files inside floppy image.');
    }

    try {
        onProgress('Decompressing SCRANTIC.SCR...');
        const scrBuf = decompressTSComp(fatFiles['SCRANTIC.SC$']);
        await saveFile('SCRANTIC.SCR', scrBuf);

        onProgress('Decompressing RESOURCE.001...');
        const resBuf = decompressTSComp(fatFiles['RESOURCE.00$']);
        await saveFile('RESOURCE.001', resBuf);
    } catch (err) {
        throw new Error('Decompression failed. The floppy image may be corrupted or fragmented. Please use the exact recommended file.');
    }

    onProgress('Saving RESOURCE.MAP...');
    await saveFile('RESOURCE.MAP', fatFiles['RESOURCE.MAP'].buffer);

    onProgress('Done!');
};
