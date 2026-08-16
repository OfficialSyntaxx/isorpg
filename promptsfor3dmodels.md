# Isoperia — Manual 3D / Art Prompt Pack

*For the color side you run yourself (higgsfield.ai studio + your Tripo access).
Everything here replaces a procedural box with a real low-poly asset. Keep the
style lock below so assets stay coherent in the isometric world.*

Audit context: game is 2.5D iso, mobile-first, low-poly, zero-asset-by-default.
Units: **tris** = triangles (polycount), textures **2K/4K**.

## How to run a model (two routes, per asset)

1. **Image → 3D (best quality):** generate the **on-site image** with `seedream_v5_lite`
   (or `seedream_v4_5`) using the *Image prompt* below, then feed it to **Tripo
   Image-to-3D**. For tougher geometry also make a **front + 3/4 view** and use
   **Multiview-to-3D**.
2. **Text → 3D (faster):** paste the *Tripo text* prompt straight into Tripo.

## Style lock (paste into every prompt)

> Low-poly stylized game asset, soft hand-painted simple textures, clean flat
> palette, toy-like proportions, rounded simple geometry — isometric RPG world,
> single subject, full body, even soft studio light, plain solid-light-grey
> background, no text, no watermark, game-ready.

---

## 1 · Reusable character / NPC base (ONE mesh → all villagers)

Make **one** biped, then re-skin per NPC in-engine (tint tunic/robes).

- **Image prompt:**
  > Low-poly stylized villager for an isometric RPG, simple tunic and trousers,
  > round friendly face with a small smile, neutral arms-out-for-lifting pose,
  > muted earthy browns, no hat, full body straight-on front view, plain light-grey
  > studio background, even light, centered, single subject, game-ready.
- **Tripo text:** `Low-poly stylized villager, simple tunic and trousers, round friendly face, toy-like proportions, neutral pose, game-ready`
- **Settings:** Texture **2K** · Poly **Low (~2–5k tris)** · skeleton optional (idle/walk are procedural)

**Skins to apply after export** (matches current NPCs): Bram = blue tunic/fisher; Wren = green/woodcutter; Old Tobias = pale elder + hat; Eldric = guide/blue-accent.

---

## 2 · Monsters (12 types — strongly recommend the two bosses first)

Common **Tripo settings:** Texture **2K** · Poly **Low** (tris noted below) · no animation needed.

| # | Monster | Texture | Target tris | Image prompt | Tripo text |
|---|---|---|---|---|---|
| 1 | **cave_brute** (boss) | 4K | ~8–10k | Low-poly hulking cave brute, broad shoulders, short horns, bone shoulder pads, tattered loincloth, angry simple face, warm-red dark cave palette, full body front view | `Low-poly hulking cave-boss brute, broad shoulders, short horns, bone pauldrons, game-ready` |
| 2 | **forest_ogre** (boss) | 4K | ~8–10k | Low-poly hulking forest ogre, mossy-green skin, small tusks, big fist, loincloth, leafy shoulder cloak, angry face, full body front view | `Low-poly forest ogre boss, mossy green skin, tusks, leafy shoulder cloak, game-ready` |
| 3 | giant_rat | 2K | ~2–3k | Low-poly oversized sewer rat, grey-brown, red eyes, hunched, stubby tail, muted palette | `Low-poly giant rat, grey-brown, red eyes, game-ready` |
| 4 | goblin | 2K | ~3–4k | Low-poly goblin, green skin, big ears, crude wooden club, hunched, tattered tunic | `Low-poly goblin with wooden club, green skin, big ears, game-ready` |
| 5 | goblin_archer | 2K | ~3–4k | Low-poly goblin archer, green skin, crouched, small bow, quiver, leather scraps | `Low-poly goblin archer with small bow, green skin, game-ready` |
| 6 | skeleton | 2K | ~3–4k | Low-poly hostile skeleton, bleached bone, empty eye sockets, rusted sword, slightly hunched | `Low-poly hostile skeleton with rusted sword, game-ready` |
| 7 | zombie | 2K | ~3–4k | Low-poly shambling zombie, grey-green skin, torn shirt, arms forward | `Low-poly shambling zombie, grey-green skin, torn shirt, game-ready` |
| 8 | dire_wolf | 2K | ~3–4k | Low-poly huge dire wolf, dark grey fur, glowing amber eyes, bared teeth, lean | `Low-poly dire wolf, dark grey, amber eyes, game-ready` |
| 9 | cave_bat | 2K | ~2–3k | Low-poly big cave bat, furled wings at sides, face-up, brown-grey, two fangs | `Low-poly large cave bat, furled wings, game-ready` |
| 10 | cave_slasher | 2K | ~3–4k | Low-poly cave slasher, jagged rocky hide, long claws, hunched predator, dark teal | `Low-poly cave slasher, rocky hide, long claws, game-ready` |
| 11 | frost_imp | 2K | ~3–4k | Low-poly frost imp, pale icy-blue, small horns, frost over body, mischievous face | `Low-poly frost imp, icy blue, small horns, game-ready` |
| 12 | bog_husk | 2K | ~3–4k | Low-poly bog husk, twisted swamp-wood body, mossy, hollow glowing eyes | `Low-poly bog husk, twisted swamp wood, mossy, glowing eyes, game-ready` |

---

## 3 · Buildings (8 — one style, set the town look)

**Settings:** Texture **2K** · Poly **Low (~5–8k tris)** · no skeleton.

| Building | Image / Tripo prompt (low-poly timber game building, single subject) |
|---|---|
| **Campfire** | stone-ring campfire, logs and small flame, smoke wisp — `Low-poly campfire, stone ring, logs, flame, game-ready` |
| **Storehouse** | small timber storehouse, slatted walls, shingled roof, wide boarded door |
| **Sawmill** | open timber sawmill, big saw blade, log stockpile, post-and-beam frame |
| **Smelter** | stone smelter/furnace, ore pile, low chimney, warm glow |
| **Granary** | raised timber granary on stilts, hatch, ladder, thatch roof |
| **Town Hall** | larger two-storey timber hall with banner, peaked roof, big door |
| **Market stall** | open market stall, canopy, crates, hanging goods |
| **Smithy** | open forge hut, anvil, chimney, tools on wall |

---

## 4 · Equipment / tools on the hero (small props)

**Settings:** Texture **2K** · Poly **Low (~1–2k tris)** each.

- **axe** → `Low-poly hand axe, wooden handle, chipped iron head, game-ready prop`
- **pick** → `Low-poly pickaxe, wooden handle, tapered iron head, game-ready prop`
- **net** → `Low-poly fishing net on a short wooden hoop handle, rope mesh, game-ready prop`
- **sword (bronze)** → `Low-poly bronze short sword, leather grip, crossguard, game-ready prop`
- **2H sword** → `Low-poly two-handed bronze sword, long blade, leather-wrapped grip, game-ready prop`
- **dagger** → `Low-poly bronze dagger, small crossguard, game-ready prop`
- **shortbow** → `Low-poly shortbow, curved wood, bowstring, quiver of arrows, game-ready prop`
- **iron sword** → `Low-poly iron sword, dark blade, steel crossguard, game-ready prop`

## 5 · Props (high-visibility, cheap wins)

- **Chest** → `Low-poly wooden treasure chest with iron bands and a latch, slightly open, game-ready prop` · 2K · ~1–2k tris
- **Dungeon door** → `Low-poly banded dungeon door in a stone frame, heavy iron lock, game-ready prop` · 2K · ~2k troms
- **Fishing marker / boat** → `Low-poly small rowboat with two oars, game-ready prop` · 2K · ~2k tris
- **Guide marker / sign** → `Low-poly wooden signpost with a pointing plank, game-ready prop` · 2K · ~1k tris

---

## On-site image models (cheap — run in the ~/higgsfield.ai studio, not in chat)

| Model | ~price | Use |
|---|---|---|
| seedream_v5_lite / seedream_v4_5 | ~$1 | All asset images above; best quality. |
| text2image_soul_v2 / soul_cast | ~$0.12 | Fast character concept variants. |
| soul_location | ~$0.12 | Skyboxes / environment backdrops. |
| z_image | cheapest | Quick thumbnail drafts. |

Rule: **image = on the site; 3D = your Tripo**. This chat’s subscription pool then stays reserved for audio (SFX + music) and any in-chat generation you explicitly approve.

## Budget note (this chat)
Usable pool ≈ **~300 credits** (subscription_balance 319.95 − ~45 used). At Tripo pricing-outsourcing the 3D is free on your side, this pool comfortably covers: full SFX pass-2 (~8), ambient music (~10, after pricing), and/or a few in-chat image assists — nowhere near drained.