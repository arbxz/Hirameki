## Workspaces

Separate sets of boards, each with its own look — one for work and one for
yourself, say, or one per project. The switcher sits to the left of the board
tabs; everything you have now lands in a workspace called **Personal**.

- Each workspace keeps its own boards **and its own theme**, so switching
  restyles the app.
- Launch reopens whichever workspace you used last, or always the same one —
  your choice, under **Settings → Workspace**.

## A new look

The whole interface has been rebuilt around a drafting-sheet language: square
corners, hairline rules, mono labels, and one shared hover inversion. There's a
new **Drafting** theme to go with it, and the other six are still there.

Three colour roles were added because the old ones were failing contrast in
practice — control outlines sat at 1.3–2.0:1, and delete controls were barely
legible on the light themes. All seven themes now pass.

## Export and import

Exporting now asks what the bundle should hold:

- **This workspace** — imports anywhere as a *new* workspace, leaving whatever
  is already there untouched. A bundle is now a portable workspace.
- **Everything** — a full backup that restores over the top, as before.

Bundles exported by older versions still import; they arrive as a new workspace
rather than wiping the device.

## Fixes

- Dragging and resizing images no longer trails the cursor, and the handles no
  longer end up offset from the picture.
- Sticky notes are calmer: index-card colours instead of highlighter, and a
  ruled header.
- Closed a hole where a crafted bundle could write files outside the app's own
  folder.

## Upgrading

Your database is upgraded on first launch and **the change is one way** — this
version cannot be downgraded to 0.3.x afterwards. Nothing is deleted, and your
boards, notes and images come across as they are. Export first if you want a
copy you can keep.

Bundles exported by **this** version cannot be opened by 0.3.3 or earlier.

Don't keep an older copy around and run it against the upgraded database. It
will open, but importing a bundle with it detaches your boards from their
workspace and they stop showing up. This version puts them back on the next
launch and tells you it did, but the tidier answer is not to run the old one.
