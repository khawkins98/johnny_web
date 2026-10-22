# Explore the story timeline

The timeline deals Johnny's **current visit as a spread of cards**, with the gags that could appear later floating behind it. A strip of the **11 story days** sits above, and the selected gag's **script steps** sit below. You need to [import the original game data](../README.md#run-locally) before scenes, card pictures, and animation previews can appear.

## Open and close

Start Classic or Enhanced playback, then click the compass near the upper-left corner or press `T`. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus.

## The spread

Each gag in the visit is a card on a stand, in the order the game planned them:

- **Leaning back:** already played this visit.
- **Raised, with a yellow frame:** Johnny now.
- **Face down:** planned for later in this visit. Hover or focus one to turn it over.
- Back-to-back idle poses fold into one **Johnny pauses** card with a count.

Card pictures are real frames, rendered in your browser from your own game data, and they fill in over a few seconds. Use **‹**, **Now**, and **›** to turn through a long visit. Tabbing to a card past the edge also turns to it.

Behind the visit floats **the deck**: gags that are not in this visit. Open cards could appear in a later visit at this day and tide. Sealed cards carry a **SEALED** stamp and say why they can't appear yet, such as **Day 7 only** or **Low tide only**. The deck shows the heaviest open gags and the sealed ones nearest to opening. **Weight N of M** compares source catalog selection weights; it is not a probability.

The ring on the floor is the **tide**: 16 phases, with the current phase in yellow. Hovering a card lights the phases where it can appear. Corner marks on a card: **☾** ends a visit, **✦N** is the key scene for day N.

## Select, play, or read a card

Click a card to select it. The info panel then offers:

- **▶ Play this gag:** starts a new visit from that gag; the story carries on from there.
- **Read its script ↓:** scrolls to the gag's script steps below.

**Return to live** goes back to Johnny's current gag without changing playback.

## Story days

The day strip lists the 11 days and their key scenes, with today highlighted. Pick a day to see its key scene. **▶ Play day N** saves that day and restarts playback from its key scene.

## Inspect or play a script scene

The script steps show the scenes inside the selected gag and the choices between them, with a silent original-game preview of the selected scene. Use **← Back** and **Forward →** to retrace a route. **▶ Play this scene now** interrupts playback, runs that scene through the original gag logic, then resumes the planned sequence. The layout shows possible routes; it is **not an exact trace of live execution, elapsed time, or the odds of a choice**.

**This gag as a script** lists the same steps as text: each condition ("After think bubble appear") and the scenes it starts or stops. Resource-loading steps are hidden. See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.
