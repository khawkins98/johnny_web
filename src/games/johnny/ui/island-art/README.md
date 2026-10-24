# Beachcomber painted artwork

Original Codex-generated interface illustrations, 2026-10-24, under the repository's MIT license. No original-game artwork is included. These five PNGs are the active skin; the older `../deck-icons/` SVGs document the earlier AGY pixel-art pass.

**Before modifying anything, read [Maintaining the illustrated Island UI](../../../../../docs/island-ui-art.md).** It explains provenance, palette, source coordinates, sprite measurements, independent CRT composition, responsive behavior and verification. Exact generation prompts are in `shelf-prompts.json` and `cabinet-prompts.json`; the model name was not exposed by the generator.

The PNGs are original-resolution sources, not exported game captures. Do not replace their transparent screen/exterior with black, glass effects or a baked game image. Update both the JS aperture and CSS clip coordinates if the cabinet opening changes. See `../island-objects.css` for shared object sampling and `../island-art.mjs` for lettering windows.
