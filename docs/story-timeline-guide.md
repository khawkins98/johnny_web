# Explore the story timeline

The timeline asks one question at a time: **which day, which tide, which gag**. It opens on the gag Johnny is playing now, with the path to it shown as a breadcrumb (for example **Day 10 › Early high tide › Eat**). Click any part of the breadcrumb to go back to that question. You need to [import the original game data](../README.md#run-locally) before scenes, card pictures, and animation previews can appear.

## Open and close

Start Classic or Enhanced playback, then click the compass near the upper-left corner or press `T`. Press `T` or `Esc`, or click **×**, to close the panel. The compass and Settings icons show their shortcuts on hover and keyboard focus. **↖ Johnny now** returns to the live gag from anywhere.

Card pictures are real frames, rendered in your browser from your own game data. They fill in over a few seconds.

## Which day?

Johnny's story runs over 11 days. Each day card shows that day's **key scene**; playing it unlocks the next day. Today is marked.

## Which tide?

The tide decides which gags can appear. The game tracks 16 tide phases, but every gag's tide window starts and ends at the same points, so three bands cover them exactly: **early high tide**, **late high tide**, and **low tide**. Each option says how many gags it allows, and the tide right now is marked. **▶ Play day N** saves that story day and restarts playback from its key scene.

## Which gag?

These are the gags the game can choose on that day at that tide, with the day's key scene first. Corner marks on a card: **☾** ends a visit, **✦N** is the key scene for day N. On today's day and tide, a **This visit** strip shows the visit the game has planned, in order, with Johnny's current gag highlighted.

## A gag

The chosen gag's card sits at the top. **▶ Play this gag** starts a new visit from it, and the story carries on from there.

Below it are the gag's scenes and the choices between them, with a silent original-game preview of the selected scene. Use **← Back** and **Forward →** to retrace a route. **▶ Play this scene now** interrupts playback, runs that scene through the original gag logic, then resumes the planned sequence. The layout shows possible routes; it is **not an exact trace of live execution, elapsed time, or the odds of a choice**.

**This gag as a script** lists the same steps as text: each condition ("After think bubble appear") and the scenes it starts or stops. Resource-loading steps are hidden. See [Johnny's 11-day story](story-over-time.md) for day progression, or [Scene flows](scene-flows/README.md) for generated script diagrams.
