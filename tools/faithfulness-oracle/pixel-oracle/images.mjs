// Image I/O for the pixel oracle: read the emulator's (gzipped) PPM dumps and write
// PNGs for eyeballing. Frames are plain { width, height, rgb: Uint8Array } (3 bytes
// per pixel) or { width, height, rgba } for our own layers.
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, gunzipSync } from 'node:zlib';

/** Parse a binary PPM (P6, maxval 255) buffer. */
export const parsePpm = (buffer) => {
    let pos = 0;
    const token = () => {
        while (pos < buffer.length) {
            const c = buffer[pos];
            if (c === 0x23) {
                while (pos < buffer.length && buffer[pos] !== 0x0a) pos++;
            } else if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) pos++;
            else break;
        }
        const start = pos;
        while (pos < buffer.length && ![0x20, 0x0a, 0x0d, 0x09].includes(buffer[pos])) pos++;
        return buffer.subarray(start, pos).toString('latin1');
    };
    const magic = token();
    if (magic !== 'P6') throw new Error(`not a P6 PPM (${magic})`);
    const width = Number(token());
    const height = Number(token());
    const maxval = Number(token());
    if (maxval !== 255) throw new Error(`unsupported PPM maxval ${maxval}`);
    pos++; // the single whitespace byte after maxval
    const rgb = new Uint8Array(buffer.buffer, buffer.byteOffset + pos, width * height * 3);
    if (rgb.length !== width * height * 3) throw new Error('truncated PPM');
    return { width, height, rgb };
};

/** Read a .ppm or .ppm.gz framebuffer dump. */
export const readFrame = (file) => {
    const raw = readFileSync(file);
    return parsePpm(file.endsWith('.gz') ? gunzipSync(raw) : raw);
};

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
};

/** Encode RGB (3 bytes/pixel) as a PNG buffer. */
export const encodePng = ({ width, height, rgb }) => {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 3 + 1)] = 0;
        Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // colour type RGB
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
};

export const writePng = (file, frame) => writeFileSync(file, encodePng(frame));

/** Place frames side by side (same height) with a 4px magenta gutter. */
export const sideBySide = (frames) => {
    const height = Math.max(...frames.map((f) => f.height));
    const width = frames.reduce((w, f) => w + f.width, 0) + 4 * (frames.length - 1);
    const rgb = new Uint8Array(width * height * 3);
    for (let i = 0; i < rgb.length; i += 3) {
        rgb[i] = 255;
        rgb[i + 2] = 255;
    }
    let x0 = 0;
    for (const f of frames) {
        for (let y = 0; y < f.height; y++) {
            rgb.set(f.rgb.subarray(y * f.width * 3, (y + 1) * f.width * 3), (y * width + x0) * 3);
        }
        x0 += f.width + 4;
    }
    return { width, height, rgb };
};
