# Playback deck pixel artwork

Original 24×24 pixel artwork generated with Google Antigravity (`agy --print`) at the user’s request, 2026-10-23. The brief was a nautical 1990s adventure toolbar; no game sprites, library icons, or reference images were supplied to the generator. The SVG output was inspected and integrated by Codex. These original project assets use the repository’s MIT license.

Icons use integer rectangles, a transparent background, and `shape-rendering="crispEdges"`. Render at 24px or whole multiples for an even pixel grid. Edit the SVG rectangles directly; no generator or build step is required. Decorative SVGs are hidden from assistive technology by the toolbar; text labels remain on the buttons.

Palette: ink `#241e18`, wood `#805a32`, brass `#c59b50`, highlight `#f5df9b`, parchment `#e8d5a7`, sea teal `#57958c`, deep teal `#294f4b`.

The toolbar and sidebar layout take inspiration from the adventure-game interfaces in the user’s screenshots, including Flight of the Amazon Queen. No artwork from those screenshots is included.

The repeatable 32×32 wood/paper tiles and 24×24 brass/paper frames were also generated through Antigravity (`gemini-3.8-flash-low`). The frame center is transparent; CSS uses an 8-pixel nine-slice border so resizing does not stretch the corners. The tile palettes vary only slightly from their base colors to stay quiet behind labels. Tiles use 32px CSS repeats; icons use 24px CSS and the brand compass 48px. All SVGs contain only checked integer rectangle geometry and palette colors.
