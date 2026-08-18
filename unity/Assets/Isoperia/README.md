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
