// Provisional artwork for the island map (issue #96). See island-map-art/README.md.
import map from './island-map-art/map.webp';
import flag from './island-map-art/flag.webp';
import signpost from './island-map-art/signpost.webp';
import fishing from './island-map-art/fishing.webp';
import campfire from './island-map-art/campfire.webp';
import reading from './island-map-art/reading.webp';
import coconuts from './island-map-art/coconuts.webp';
import lilliput from './island-map-art/lilliput.webp';
import diving from './island-map-art/diving.webp';
import canoe from './island-map-art/canoe.webp';
import visitors from './island-map-art/visitors.webp';
import bottle from './island-map-art/bottle.webp';
import bath from './island-map-art/bath.webp';
import jogging from './island-map-art/jogging.webp';
import sandcastle from './island-map-art/sandcastle.webp';
import leafbed from './island-map-art/leafbed.webp';
import summer from './island-map-art/summer.webp';
import raft from './island-map-art/raft.webp';
import shark from './island-map-art/shark.webp';

export const islandMapArt = Object.freeze({
    map,
    flag,
    signpost,
    places: Object.freeze({ fishing, campfire, reading, coconuts, lilliput, diving, canoe, visitors, bottle, bath, jogging, sandcastle, leafbed, summer, raft, shark }),
});
