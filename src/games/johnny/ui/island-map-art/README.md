# Island map artwork (provisional)

Test artwork for the story timeline's island map, [issue #96](https://github.com/khawkins98/johnny_web/issues/96). **Provisional:** good enough to build and judge the map against, and due to be replaced by one final, consistent pass once the layout and the list of places have settled.

Original illustrations generated with Codex's built-in image generator on 2026-11-12, under the repository's MIT license. No original-game artwork is included, and none of it depicts the game's characters. Exact prompts, references and processing are in [`prompts.json`](prompts.json); the working recipe is in [Maintaining the illustrated Island UI](../../../../../docs/island-ui-art.md#generating-artwork-from-the-command-line-2026-11-12).

| File | Role |
| --- | --- |
| `map.webp` | The fold-out map base, 1536×1024: island, palm, rock and beached raft only |
| sixteen `<place>.webp` | One object per place in [`island-places.mjs`](../../island-places.mjs), named by place id, at most 300×300 with alpha |
| `flag.webp` | The story-day marker; the day number is drawn by the page |
| `signpost.webp` | Heading picture for the map's side panel |

These are web-sized derivatives. The full-resolution sheets are linked from the issue. Positions live in `island-places.mjs`, not here.
