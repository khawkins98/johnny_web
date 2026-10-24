# Johnny UI artwork and layout

Before changing the illustrated Island UI, read [docs/island-ui-art.md](../../../../docs/island-ui-art.md). It is the maintained style/implementation guide, with exact prompts, source art, measured sprite windows, cabinet aperture, and browser checks.

- The active skin is `island-art/`, shared `island-theme.css`/`island-objects.css`, plus `island-art.mjs`, `splash.css` and `playback-deck.css`. Use the shared palette and crop windows rather than duplicating them. `deck-icons/` is the earlier AGY pixel-art study, not the current visual direction.
- Keep the actual game/CRT separate from decorative art. Update `island-layout.mjs`, shared `island-cabinet.css` source slices/aperture clip, and registered hardware hit areas if the cabinet opening changes. Keep Johnny 4:3 and preserve his native canvas buffers.
- Log overlays the right cabinet controls; opening it must not resize the picture. H hides/restores all interface art while retaining Log state and independent CRT settings.
- Keep real playback/navigation in the existing runtime/coordinator. Do not substitute sample stats or nonfunctional art-preview actions into the live UI.
- Save exact new prompts/provenance alongside original interface assets. Keep proprietary game/reference captures in ignored scratchpad, never the asset directory.

Run the UI tests and production build, then inspect actual-game desktop/mobile screenshots using an isolated agent-browser session. The guide lists the relevant sizes and interaction checks.
