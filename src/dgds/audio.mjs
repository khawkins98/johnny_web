/**
 * Web Audio API manager for DGDS game audio.
 *
 * Audio samples are embedded in SCRANTIC.SCR as raw PCM/audio blocks. sampleOffsets[] maps
 * sample index (as used by PLAY_SAMPLE opcodes) to byte offsets in that file. Each entry is
 * a 4-byte header + size field followed by raw audio data.
 *
 * NOTE: sampleOffsets are hardcoded for Johnny Castaway v1.01 (Int. 1.4.93). A different
 * version of the game data would require recalibrating these offsets.
 *
 * NOTE: sampleOffsets[0] and sampleOffsets[11] are -1, meaning those indices have no sample.
 * NOTE: The full SCRANTIC.SCR file (~295 KB) is fetched from the network for every cache miss.
 * Only the relevant slice is decoded. A range-request approach would reduce bandwidth.
 */
const samplesSourceCache = [];

export const sampleOffsets = [
    -1,
    0x1DC00, 0x20800, 0x20E00,
    0x22C00, 0x24000, 0x24C00,
    0x28A00, 0x2C600, 0x2D000,
    0x2DE00,
    -1, 0x34400, 0x32E00,
    0x39C00, 0x43400, 0x37200,
    0x37E00, 0x45A00, 0x3AE00,
    0x3E600, 0x3F400, 0x41200,
    0x42600, 0x42C00, 0x43400
];

const createAudioContext = () => {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    return new AudioContext();
};

const getSoundFxSource = (config, context, output) => {
    const source = {
        volume: config.soundFxVolume,
        isPlaying: false,
        currentIndex: -1,
        bufferSource: null,
        gainNode: context.createGain(),
        lowPassFilter: context.createBiquadFilter(),
    };
    source.lowPassFilter.type = 'allpass';

    source.play = () => {
        source.isPlaying = true;
        source.bufferSource.start();
    };
    source.stop = () => {
        try {
            if (source.bufferSource) {
                source.bufferSource.stop();
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.debug(error);
        }
        source.isPlaying = false;
    };
    source.load = (index, callback) => {
        if (!Number.isInteger(index) ||
            index < 0 ||
            index >= sampleOffsets.length ||
            (source.currentIndex === index && source.isPlaying) ||
            sampleOffsets[index] === -1) {
            return;
        }
        if (source.isPlaying) {
            source.stop();
        }
        source.currentIndex = index;
        source.bufferSource = context.createBufferSource();
        source.bufferSource.onended = () => {
            source.isPlaying = false;
        };

        if (samplesSourceCache[index]) {
            source.bufferSource.buffer = samplesSourceCache[index];
            source.connect();
            callback.call();
        } else {
            fetch(`${import.meta.env.BASE_URL}data/SCRANTIC.SCR`).then((response) => response.arrayBuffer()).then((fileBuffer) => {
                const data = new DataView(fileBuffer);
                const size = data.getInt32(sampleOffsets[index] + 4, true) + 8;
                const buffer = data.buffer.slice(sampleOffsets[index], sampleOffsets[index] + size);

                context.decodeAudioData(
                    buffer,
                    (decodeBuffer) => {
                        if (!samplesSourceCache[index]) {
                            if (!source.bufferSource.buffer) {
                                source.bufferSource.buffer = decodeBuffer;
                                samplesSourceCache[index] = decodeBuffer;
                                source.connect();
                                callback.call();
                            }
                        }
                    }, (err) => {
                        console.error(err);
                    }
                );
            });
        }
    };

    source.connect = () => {
        // source->gain->context
        source.bufferSource.connect(source.gainNode);
        source.gainNode.gain.setValueAtTime(source.volume, context.currentTime + 1);
        source.gainNode.connect(source.lowPassFilter);
        source.lowPassFilter.connect(output);
    };

    return source;
};

export const createAudioManager = (config) => {
    const context = config.context || createAudioContext();
    const masterGain = context.createGain();
    masterGain.connect(context.destination);
    const sfxSource = getSoundFxSource(config, context, masterGain);
    const manager = {
        context,
        getSoundFxSource: () => sfxSource,
        enabled: config.enabled !== false,
        setEnabled(enabled) {
            manager.enabled = Boolean(enabled);
            masterGain.gain.setValueAtTime(manager.enabled ? 1 : 0, context.currentTime);
        },
    };
    manager.setEnabled(manager.enabled);
    return manager;
};
