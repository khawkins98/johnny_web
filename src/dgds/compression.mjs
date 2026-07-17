import { decompressRLE } from './compression/rle.mjs';
import { decompressLZW } from './compression/lzw.mjs';

export const CompressionType = [
    { index: 0, type: 'None', callback: null },
    { index: 1, type: 'RLE', callback: decompressRLE },
    { index: 2, type: 'LZW', callback: decompressLZW },
];

export const decompress = (type, data, offset, length) => {
    if (!type) {
        return data;
    }
    return CompressionType[type].callback(data, offset, length);
};
