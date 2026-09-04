#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const tracePath = process.argv[2];
if (!tracePath) {
    console.error('usage: node rng-consumer-report.mjs <trace.log>');
    process.exit(2);
}

const lines = readFileSync(tracePath, 'utf8').split('\n');
const firstDirector = lines.findIndex((line) => /\bdirector\b/.test(line) && !line.startsWith('#'));
if (firstDirector < 0) throw new Error('trace has no director call');

const before = lines.slice(0, firstDirector).filter((line) => line.startsWith('RNG '));
const window = [];
for (const line of lines.slice(firstDirector + 1)) {
    if (/\bcompletion\b/.test(line) && !line.startsWith('#')) break;
    const match = line.match(/^RNG \d+ .* caller=([0-9A-F]+):([0-9A-F]+)/i);
    if (match) window.push(`${match[1].toLowerCase()}:${match[2].toLowerCase()}`);
}

const counts = Object.fromEntries(
    [...new Set(window)].sort().map((caller) => [caller, window.filter((value) => value === caller).length]),
);
console.log(JSON.stringify({ preFirstDirectorDraws: before.length, firstStoryWindow: { counts, callers: window } }, null, 2));
