/**
 * island-places.mjs — the places on the story timeline's island map (issue #96).
 *
 * The map shows one painted object per kind of thing you can go and watch, not one per
 * gag: 51 markers read as noise, and the catalogue's own positions are where Johnny
 * stands when a gag begins (35 of 51 at two spots), not where the shark or the boat is.
 * So each everyday gag belongs to exactly one place, grouped by what the viewer sees.
 *
 * `x`, `y` and `width` are percentages of the map picture: the object's centre and its
 * width. They were placed by eye on the provisional artwork.
 */
import { everydayGagsByFamily, bandsFor, findRecord, gagFacts, storyScenes } from './story-steps.mjs';

const gags = (script, ...tags) => tags.map((tagId) => Object.freeze({ script: `${script}.ADS`, tagId }));
const place = (id, name, x, y, width, list) => Object.freeze({ id, name, x, y, width, gags: Object.freeze(list) });

export const ISLAND_PLACES = Object.freeze([
    place('fishing', 'The fishing spot', 66, 72.5, 8, gags('FISHING', 1, 2, 3, 4, 5, 6, 7, 8)),
    place('campfire', 'The campfire', 46, 52, 7.5, gags('BUILDING', 5, 7, 8, 9)),
    place('reading', 'The reading spot', 56, 63, 8, gags('ACTIVITY', 6, 7, 10, 12)),
    place('coconuts', 'The coconut palm', 77, 47, 6.5, gags('VISITOR', 4, 5, 6, 7)),
    place('lilliput', 'Lilliput', 36, 43, 7.5, gags('BUILDING', 2, 4, 6)),
    place('diving', 'The diving spot', 15, 27, 9.5, gags('ACTIVITY', 1, 4)),
    place('canoe', "The natives' canoe", 10, 11, 11, gags('ACTIVITY', 5, 9)),
    place('visitors', "The visitors' boat", 89, 17, 12, gags('VISITOR', 1, 3)),
    place('bottle', 'Bottle beach', 60, 89, 8, gags('JOHNNY', 4, 5)),
    place('bath', 'The bath', 38, 80, 9.5, gags('ACTIVITY', 8, 11)),
    place('jogging', 'The jogging track', 42, 66, 7, gags('WALKSTUF', 3, 1)),
    place('sandcastle', 'The sandcastle', 29, 61, 7.5, gags('BUILDING', 1)),
    place('leafbed', 'The leaf bed', 59, 44, 7.5, gags('BUILDING', 3)),
    place('summer', 'A hot summer day', 23, 47, 7.5, gags('MISCGAG', 1)),
    place('raft', 'Raft trips', 92, 74, 9.5, gags('WALKSTUF', 2)),
    place('shark', 'Shark waters', 9, 83, 11, gags('MISCGAG', 2)),
]);

/** Where the eleven story-day markers sit: a gentle trail across the top of the sea. */
export const storyTrail = () => storyScenes().map((scene, index) => ({
    scene,
    day: scene.keyDay,
    x: 22 + index * 5.6,
    y: 9.5 + Math.sin(index * 0.9) * 2.4,
}));

/** Places with each gag's catalogue facts (windows, flags), ready for the map. */
export const islandPlaces = () => ISLAND_PLACES.map((entry) => ({
    ...entry,
    gags: entry.gags.filter(findRecord).map((gag) => gagFacts(gag)),
}));

/** The place a gag belongs to, or null for story scenes and fillers. */
export const placeForGag = (gag) =>
    gag ? ISLAND_PLACES.find((entry) => entry.gags.some((item) => item.script === gag.script && item.tagId === gag.tagId)) ?? null : null;

/** Whether anything at a place can play in `bandId` (any time when no band is given). */
export const placeOpenAt = (entry, bandId) =>
    !bandId || entry.gags.some((gag) => bandsFor(gag).some((band) => band.id === bandId));

/** Every everyday gag key the catalogue has, for checking the table covers them all. */
export const everydayGagKeys = () => everydayGagsByFamily().flatMap((group) => group.gags.map((gag) => gag.key));
