/**
 * Converts byte sequence numbers into String
 * @param {*} buffer DataView buffer
 * @param {*} offset Offset of the current DataView buffer
 * @param {*} length Max size of the string
 */
export const getString = (buffer, offset, length = 100) => {
    const slice = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, length);
    return new TextDecoder().decode(slice).replace(/\0.*$/, '');
};
