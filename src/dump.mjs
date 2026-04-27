#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

import {
    dumpResourceIndex,
    dumpResourceEntriesCompressed,
    dumpAvailableTypes,
    dumpImages,
    dumpMovieScripts,
    dumpADSScripts,
    dumpSamples,
} from './dgds/utils/dump.mjs';

import { loadResources } from './dgds/resource.mjs'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataPath = path.join(root, 'public', 'data');
const dumpPath = path.join(root, 'dumps');

const fc = fs.readFileSync(path.join(dataPath, 'RESOURCE.MAP'));
const buffer = fc.buffer.slice(fc.byteOffset, fc.byteOffset + fc.byteLength);

const resfc = fs.readFileSync(path.join(dataPath, 'RESOURCE.001'));
const resbuffer = resfc.buffer.slice(resfc.byteOffset, resfc.byteOffset + resfc.byteLength);

const scrfc = fs.readFileSync(path.join(dataPath, 'SCRANTIC.SCR'));
const scrbuffer = scrfc.buffer.slice(scrfc.byteOffset, scrfc.byteOffset + scrfc.byteLength);

const resindex = loadResources(buffer, resbuffer);

// Export Wave files
dumpSamples(dumpPath, scrbuffer);

// Export Resource Index in JSON file
dumpResourceIndex(dumpPath, resindex);
dumpResourceEntriesCompressed(dumpPath, resindex);
dumpAvailableTypes(dumpPath, resindex);
dumpImages(dumpPath, resindex);
dumpMovieScripts(dumpPath, resindex);
dumpADSScripts(dumpPath, resindex);

console.log('Dump Complete!!');
