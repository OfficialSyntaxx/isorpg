# Assembly layout

Three assemblies, and the split is load-bearing rather than tidiness.

```
Isoperia.Core        noEngineReferences: true   <- all ported game logic
  Runtime/Sim/         tick loop, RNG
  Runtime/World/       grid, tiles, world generation
  Runtime/AI/          pathfinding
  Runtime/Data/        content definitions loaded from JSON
  Tests/               EditMode tests (port-fidelity assertions)

Isoperia.Unity       references Isoperia.Core   <- presentation & lifecycle
  Runtime/             MonoBehaviours, rendering, input, UI
```

## Why Core cannot reference UnityEngine

`Isoperia.Core.asmdef` sets `"noEngineReferences": true`. That is deliberate and
it buys three things:

1. **The boundary is enforced by the compiler, not by discipline.** The web
   version kept its systems free of rendering concerns by convention; a stray
   `Debug.Log` or `Vector3` in the sim layer would compile fine there. Here it
   simply will not build.

2. **Port-fidelity tests run without Unity.** Every rule in
   `docs/PORTING_SPEC.md` — the XP curve, hit chance, drop tables, world-gen
   determinism, A* — is pure arithmetic over plain types. Because Core has no
   engine dependency it compiles with any C# compiler, so those tests run in CI
   in seconds with no Unity licence, alongside the slower in-Editor suite.
   `scripts/verify-core-parity.cjs` does exactly this.

3. **It matches the WebGL constraint.** Core is single-threaded plain C# with no
   engine allocation patterns, which is what the WebGL target requires anyway.

Presentation reads Core's state and never writes gameplay outcomes back into it.
Animation, VFX and the camera are downstream of the 600 ms tick, never inputs to
it.

## Mono's `mcs` disagrees with Roslyn, silently — twice so far

`Isoperia.Core` is declared `noEngineReferences` so the whole port can be
compiled and tested with `mcs` in about a second, with no Unity licence. Unity
builds the *same source* with Roslyn. Where the two compilers disagree, the
verification harness tests something the game does not do — which is precisely
what the harness exists to prevent.

Two disagreements are confirmed, and neither produced a warning:

1. **Tuple swap.** `(a[i], a[j]) = (a[j], a[i])` was miscompiled into list
   indexer calls, corrupting the A\* binary heap so anything beyond an adjacent
   tile returned null. `AStar.Swap` is written longhand with an explicit
   temporary because of this.

2. **Digit separators.** `20_000` parses as `200000`, `3_600_000` as
   `366000000`, `1_787_000_000_000` as `17787000000000000`. It compiles and runs
   with different numbers.

   This one hides especially well: a test comparing two mangled constants still
   passes, because they usually scale together. A 20 s interval and a 60 s
   window are both ten times too large, so "three logs per minute" held while
   both numbers were wrong. It only surfaced where a literal met real data from
   the content JSON, which is parsed at runtime and therefore correct.

   `npm run verify:separators` bans them from Core.

**Rule:** treat `mcs` as a second compiler whose disagreements are silent. When
a C# feature has a plainer equivalent, prefer the plainer one in this assembly.
