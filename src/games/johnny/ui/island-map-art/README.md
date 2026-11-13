# Island map artwork (provisional)

Test artwork for the story timeline's island map, [issue #96](https://github.com/khawkins98/johnny_web/issues/96). **Provisional:** good enough to build and judge the map against, and due to be replaced by one final, consistent pass once the layout and the list of places have settled.

Original illustrations generated with Codex's built-in image generator on 2026-11-12, under the repository's MIT license. No original-game artwork is included, and none of it depicts the game's characters. Exact prompts, references and processing are in [`prompts.json`](prompts.json); the working recipe is being added to [Maintaining the illustrated Island UI](../../../../../docs/island-ui-art.md) in [#95](https://github.com/khawkins98/johnny_web/pull/95).

| File | Role |
| --- | --- |
| `beach.webp` | The sand and surf everything lies on, 1600×1000 |
| `map.webp` | The fold-out map, 1536×1024: island, palm, rock and beached raft only |
| sixteen `<place>.webp` | One object per place in [`island-places.mjs`](../../island-places.mjs), named by place id, at most 300×300 with alpha |
| `logbook.webp` | The blank open logbook behind the diary; the writing is live text |
| `flag.webp`, `flagToday.webp` | Story-day flags in cream and orange; the day number is drawn by the page |
| `signpost.webp` | Marks a picked day's story scene on the island |
| `starfish.webp`, `driftwood.webp`, `shell.webp`, `footprints.webp` | Decoration: by the logbook, holding the map's corners, leading to today's flag |

These are web-sized derivatives. The full-resolution sheets are linked from the issue. Positions live in `island-places.mjs`, not here.
