# Isoperia — Devlog

<!--
  THE PUBLIC DEVLOG. This file is the authoring surface for /devlog on the
  website, and it is written for players.

  It is deliberately NOT UPDATES.md. That file is the engineering changelog: it
  names source files, build scripts, tool commands, asset vendors and what they
  cost. All of that is useful to whoever is building the game and none of it
  belongs on a public page, so the website reads this file instead.

  Two rules for anything added here:

  1. Write it for someone who plays the game and has never seen the repository.
     Describe what changed in the world, not which file changed.
  2. Never name a path, a script, a command, a build tool, an asset vendor or a
     budget. scripts/verify-no-internals.cjs fails the build if one slips
     through, and that check is the backstop, not the rule.

  Heading shape is "## YYYY-MM-DD · Title" or "## YYYY-MM · Title". Anything
  else stops the build rather than vanishing silently.
-->

## 2026-08-27 · Isoperia has a home on the web

The game now sits at its own address, with a proper front door in front of it.
Everything you need before playing — what the game is, how the world is laid
out, how progression works, what is coming next — lives on the site, and the
game itself is one click away and still loads straight in the browser with
nothing to install.

The wiki is the part worth knowing about. It is not written by hand: every
skill, drop table, crafting recipe, building cost and experience threshold on
that page is read directly out of the game's own data when the site is built.
That means it cannot quietly go stale the way a hand-maintained wiki does. If a
recipe changes in the game, the page changes with it.

## 2026-08-25 · Hearthvale starts to look lived-in

The settlement has stopped being a set of placeholder shapes. Hearthvale's
buildings, market stalls, fences, carts and roadside clutter are real props now,
placed by hand along the east road rather than scattered by a rule, so the town
reads as somewhere people actually live and work.

The point of this pass was readability as much as decoration. You should be able
to tell the forge from the sawmill at a glance, from a distance, while moving —
and know which way the road goes without opening a map.

## 2026-08-24 · Landmarks you can navigate by

Three landmarks went into the world as things you steer towards: the forge at
the heart of Hearthvale, the shrine out in the Wildwood, and the mine cut into
the Frostwatch highlands. Each one is visible well before you reach it and each
one marks a different kind of place, so the horizon tells you something.

Alongside them, the survey markers along the mainland routes were redrawn to be
legible at travel speed. A marker you have to stop and squint at is not a
wayfinding aid.

## 2026-08-24 · Waystones, and getting home again

Return waystones can now be attuned. Reaching one and attuning it makes it a
place you can return to, which turns a long walk into the deep wilds from a
one-way commitment into an expedition you can stage.

This came with a less visible but more important change: returning is now
reconciled authoritatively. If a session ends badly — a lost connection, a
closed tab, a crash mid-fight — you come back to a state the game agrees with,
rather than to whatever the last frame happened to believe.

## 2026-08-24 · The mainland, on foot

Travel is the thing this pass was about. The mainland now has continuous
terrain shading rather than visible tile seams, a corrected coastline and
horizon, and route foundations that connect the settlement outward to the
biomes instead of dropping you into an empty plane.

Movement matches it: grounded third-person travel with proper collision and
recovery, so walking somewhere feels like walking somewhere.

## 2026-08-23 · Isoperia is becoming a 3D open world

The fixed isometric tile view was always a prototype. It proved the systems —
gathering, crafting, building, combat, villagers — and it was never going to be
the way the game was played.

So the presentation is being rebuilt as a 3D open world with a third-person
camera you can orbit and zoom, closer in travel feel to the games this one grew
out of. The rules underneath do not change: your saves, your skills and the
world's logic carry across intact. What changes is that you walk through the
world instead of tapping across it.

The traversal foundation and the terrain migration are done — the camera,
movement, collision and direct interaction with things in the world are live,
and the world renders as one continuous surface. Connected biomes, the full
content pass and a wider test release are what remain.

## 2026-08 · Cinder Hollow, and fights worth thinking about

The first real expedition is playable: Cinder Hollow, reached through the deep
east, lit in pools rather than evenly, and built to be entered deliberately
rather than wandered into.

Combat gained the depth to make it interesting. You pick an attack style per
fight — accurate, aggressive or defensive. Resolve is a pool you spend on
precision, power or warding and refill by resting. Every weapon has a charged
special. Monsters can roll affixes that make them hardened, swift or unusually
rich. And losing costs you: fifteen per cent of the bulk resources you were
carrying stays where you fell.

## 2026-08 · The settlement loop

The core of the game settled into its shape this month: gather raw materials,
build a sawmill and a smelter, craft what you gathered into planks, bars, tools
and armour, fight your way further out, and then assign villagers to do the
gathering while you are away.

Villagers are the part that ties it together. Putting someone to work on a task
means the settlement keeps producing between sessions, so coming back after a
day away is a reward rather than a restart.
