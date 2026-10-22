// The isolable gag list (the sequencing oracle's reference index) and ADS ids.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const ADS_HEX = Object.freeze({
    ACTIVITY: '0x65', BUILDING: '0x66', FISHING: '0x68', JOHNNY: '0x69', MARY: '0x6a',
    MISCGAG: '0x6b', STAND: '0x6c', SUZY: '0x6d', VISITOR: '0x6e', WALKSTUF: '0x6f',
});

/** 'NAME:tag' for every gag in test/faithfulness-refs/index.json (64). */
export const allGags = () =>
    JSON.parse(readFileSync(path.join(repoRoot, 'test/faithfulness-refs/index.json'), 'utf8')).map(
        (entry) => `${entry.name}:${entry.tag}`,
    );
