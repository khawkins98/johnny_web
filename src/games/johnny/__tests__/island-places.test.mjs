import { describe, expect, it } from 'vitest';
import { ISLAND_PLACES, everydayGagKeys, islandPlaces, placeForGag, placeOpenAt, storyTrail } from '../island-places.mjs';

describe('island map places', () => {
    it('puts every everyday gag in exactly one place, and nothing else', () => {
        const placed = ISLAND_PLACES.flatMap((place) => place.gags.map((gag) => `${gag.script}:${gag.tagId}`));
        expect(placed).toHaveLength(40);
        expect(new Set(placed).size).toBe(40);
        expect([...placed].sort()).toEqual([...everydayGagKeys()].sort());
    });

    it('has sixteen uniquely named places that fit on the map', () => {
        expect(ISLAND_PLACES).toHaveLength(16);
        expect(new Set(ISLAND_PLACES.map((place) => place.id)).size).toBe(16);
        expect(new Set(ISLAND_PLACES.map((place) => place.name)).size).toBe(16);
        for (const place of ISLAND_PLACES) {
            expect(place.x - place.width / 2).toBeGreaterThanOrEqual(0);
            expect(place.x + place.width / 2).toBeLessThanOrEqual(100);
            expect(place.y).toBeGreaterThan(4);
            expect(place.y).toBeLessThan(96);
        }
    });

    it('knows which places are open at each time of day', () => {
        const open = (band) => ISLAND_PLACES.filter((place) => placeOpenAt(islandPlaces().find((p) => p.id === place.id), band)).map((p) => p.id);
        expect(open(null)).toHaveLength(16);
        // Night closes the three daytime-only places; the campfire stays open for its two night gags.
        expect(ISLAND_PLACES.map((p) => p.id).filter((id) => !open('night').includes(id)).sort()).toEqual(['bottle', 'raft', 'shark']);
        expect(open('night')).toContain('campfire');
        // Early day is the only time the shark is about.
        expect(open('early')).toContain('shark');
        expect(open('late')).not.toContain('shark');
    });

    it('files each gag by what happens in it, not by its script file', () => {
        // The boat he swims out to and the plane that buzzes him are visitors, not jogging or coconuts.
        expect(placeForGag({ script: 'WALKSTUF.ADS', tagId: 1 }).id).toBe('visitors');
        expect(placeForGag({ script: 'VISITOR.ADS', tagId: 5 }).id).toBe('visitors');
        expect(ISLAND_PLACES.find((place) => place.id === 'coconuts').gags.map((gag) => gag.tagId)).toEqual([4, 6, 7]);
        expect(ISLAND_PLACES.find((place) => place.id === 'jogging').gags).toHaveLength(1);
        // Lilliput's three gags live in the BUILDING script beside the sandcastle and the fire.
        expect(ISLAND_PLACES.find((place) => place.id === 'lilliput').gags.map((gag) => `${gag.script}:${gag.tagId}`))
            .toEqual(['BUILDING.ADS:2', 'BUILDING.ADS:4', 'BUILDING.ADS:6']);
    });

    it('finds a gag\'s place, and gives story scenes a trail of eleven days in order', () => {
        expect(placeForGag({ script: 'FISHING.ADS', tagId: 3 }).id).toBe('fishing');
        expect(placeForGag({ script: 'MARY.ADS', tagId: 1 })).toBeNull();
        expect(placeForGag(null)).toBeNull();
        const trail = storyTrail();
        expect(trail.map((stop) => stop.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
        expect(trail.every((stop, i) => i === 0 || stop.x > trail[i - 1].x)).toBe(true);
    });
});
