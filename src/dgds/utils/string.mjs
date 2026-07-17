/**
 * Converts byte sequence numbers into String
 * @param {*} buffer DataView buffer
 * @param {*} offset Offset of the current DataView buffer
 * @param {*} length Max size of the string
 */
export const getString = (buffer, offset, length = 100) => {
    const remaining = buffer.byteLength - offset;
    const actualLength = Math.min(length, remaining);
    if (actualLength <= 0) return '';
    const slice = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, actualLength);
    let nullIdx = slice.indexOf(0);
    if (nullIdx === -1) nullIdx = actualLength;
    return new TextDecoder().decode(slice.subarray(0, nullIdx));
};
