/**
 * Web Audio API manager for DGDS game audio.
 *
 * A game package supplies the sample archive name and the mapping from DGDS
 * sample index to byte offset. Each embedded entry is a four-byte header plus a
 * size field followed by raw audio data.
 */
const samplesSourceCache = new Map();

const createAudioContext = () => {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    return new AudioContext();
};

const getSoundFxSource = (config, context, output) => {
    const { archive, sampleOffsets } = config.sampleCatalog;
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
        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= sampleOffsets.length ||
            (source.currentIndex === index && source.isPlaying) ||
            sampleOffsets[index] === -1
        ) {
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

        const cacheKey = `${archive}:${index}`;
        if (samplesSourceCache.has(cacheKey)) {
            source.bufferSource.buffer = samplesSourceCache.get(cacheKey);
            source.connect();
            callback.call();
        } else {
            fetch(`${import.meta.env.BASE_URL}data/${archive}`)
                .then((response) => response.arrayBuffer())
                .then((fileBuffer) => {
                    const data = new DataView(fileBuffer);
                    const size = data.getInt32(sampleOffsets[index] + 4, true) + 8;
                    const buffer = data.buffer.slice(sampleOffsets[index], sampleOffsets[index] + size);

                    context.decodeAudioData(
                        buffer,
                        (decodeBuffer) => {
                            if (!samplesSourceCache.has(cacheKey)) {
                                if (!source.bufferSource.buffer) {
                                    source.bufferSource.buffer = decodeBuffer;
                                    samplesSourceCache.set(cacheKey, decodeBuffer);
                                    source.connect();
                                    callback.call();
                                }
                            }
                        },
                        (err) => {
                            console.error(err);
                        },
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
    if (!config?.sampleCatalog?.archive || !Array.isArray(config.sampleCatalog.sampleOffsets)) {
        throw new TypeError('Audio manager requires a game sampleCatalog');
    }
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
        stopAll() {
            sfxSource.stop();
        },
    };
    manager.setEnabled(manager.enabled);
    return manager;
};
