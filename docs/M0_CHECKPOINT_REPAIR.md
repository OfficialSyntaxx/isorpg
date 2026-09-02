# Repair checkpoint a751c69 before advancing M0

Reviewed 2026-09-02 against `a751c69b6e1d39257c960fa8af5236cf2a2c5dcc`.
Result: **not accepted for completion**. Preserve the partial assets and original
`M0_REMOTE_RETURN.md`; its Editor observations are not proof of serialized state.
[CI run 33666175031](https://github.com/OfficialSyntaxx/isorpg/actions/runs/33666175031)
passed, including the palette checks. That workflow does not compile these Unity
runtime scripts/shaders or validate the scene in Play Mode.

This repair takes priority over the execution sequence in `M0_REMOTE_SESSION.md`.
Its project-identity safeguards, evidence rules and stop before M0-04 still apply.

## Findings from the committed source

| Priority | Evidence | Implication |
|---|---|---|
| Blocker | `Assets/Isoperia/Scenes/ShorelandsM0.unity` has `m_Roots: []`, with no GameObject, Transform, Terrain, Camera or MonoBehaviour records | The reported hierarchy was not saved in the committed scene. The cause of this persistence failure is unknown. The M0 script has no automatic creation entry point and is not attached in that scene. |
| Blocker | `M0InspectionBootstrap.Awake/Update` searches every MonoBehaviour and destroys components or GameObjects in `Isoperia.Unity` | This is cleanup after startup, not isolation. A component can already have run Awake; destruction is deferred. Whole-object deletion can affect an inspection object that carries a legacy component. |
| Blocker | `WorldRuntime.CreateRuntime` runs BeforeSceneLoad; `OpenWorldExperience.Create` runs AfterSceneLoad and its Awake modifies `Camera.main` and creates legacy presentation/player objects | Scene-local execution order cannot gate these callbacks. Their side effects explain a credible path to interference, but the exact reported camera deletion needs fresh runtime evidence. |
| Blocker | `SaveDriver.Awake` constructs `FileSaveStore` and calls `Save.Load()` | Destroying a SaveDriver after creation does not establish zero save access. No evidence proves saves changed in the partial session; do not assume either mutation or safety. |
| High | `com.unity.modules.terrain` is resolved transitively; `com.unity.modules.terrainphysics` is absent from manifest and lockfile | Consistent with the report that TerrainCollider's module is disabled. Verify the exact Console message and built-in module state in the correct Editor before correcting it. Terrain rendering and terrain collision are distinct dependencies. |
| High | `ShorelandsAtlasSurface.shader` only blends mesh COLOR channels at fixed atlas tones; it has no authored Terrain control mapping or UV-based timber sampling | An imported shader is not demonstrated Terrain compatibility or the general atlas-UV world material. Both usages still need implementation and verification. |
| High | Water fragment shader computes water depth from `i.positionHCS.z / i.positionHCS.w` while sampling scene depth | Fragment-stage SV_POSITION is not the original vertex clip position. Verify and correct comparable eye-depth values using URP conventions; check that a depth texture is supplied. Compile success does not prove shoreline foam. |
| High | Motor/camera use legacy keyboard/mouse Input; no touch joystick exists | Desktop preview only. Current input handling is Both, so legacy Input alone is not evidence of the reported failure, but mobile controls remain unimplemented. |

## Connected repair sequence

1. **Reconnect and recover the authored hierarchy.** Fetch this branch, select the
   exact `/Users/syntaxx/isorpg-m0/unity` Editor after read-only identity probes.
   Preserve dirty scene state and inspect whether the reported hierarchy is still
   available in Edit Mode, another scene, or a saved local copy. Do not close or
   reload away unsaved work. If it only existed in Play Mode, do not treat those
   transient objects as saved authoring; recover safely or recreate in Edit Mode.
   Save `ShorelandsM0.unity` explicitly, preserving its GUID and existing art assets.
   Verify the on-disk scene contains roots, Terrain/TerrainCollider references,
   camera, player, bootstrap references, light, water, and labelled placeholders.
   Check the exact staged blob before committing. After saving and preserving any
   other dirty work, reopen the scene and confirm the same hierarchy persists.

2. **Replace culling with startup prevention before another Play Mode attempt.**
   Remove the per-frame namespace-wide destruction workaround. Implement a scoped,
   explicit inspection startup policy at the actual legacy creation boundaries.
   Audit every RuntimeInitialize callback and every save-service creation route;
   handle BeforeSceneLoad, AfterSceneLoad, scene transitions and domain-reload
   settings deliberately. Do not assume a marker's Awake runs before runtime
   callbacks or that a scene name is available at every startup phase. Prevent
   legacy world/HUD/player/camera/save creation in the proof, while retaining normal
   Bootstrap behavior outside it. Keep this limited to isolation, not M1 migration.
   Add targeted Unity lifecycle regression coverage if practical; otherwise record
   the exact controlled entry/exit/reload procedure. No real-save experiment.

3. **Restore Terrain collision.** Capture the missing-module diagnostic and verify
   installed built-in modules. Restore the required terrain physics dependency for
   the GDD's already-selected Unity Terrain, letting Unity resolve the lockfile.
   This is a feature dependency correction, not a package/provider upgrade. Keep
   unrelated versions/settings unchanged. Reimport and verify TerrainCollider
   survives Play Mode and references the same TerrainData as Terrain. Do not replace
   the heightfield with a flat plane merely to make traversal appear to work.

4. **Verify isolation, then finish rendering and controls.** Use a controlled test
   save location or a fixture that cannot touch existing saves; establish absence
   of save-service creation and file I/O, not just an empty late hierarchy. Capture
   runtime objects immediately after startup and after several frames, then repeat
   Play Mode entry/exit. The inspection camera and collider must survive. Check
   nearby legacy startup with a disposable save fixture. Then finish actual Terrain
   palette blending, atlas-UV mesh shading, anchored GPU wind, comparable water/scene
   depths and visible shoreline foam. Add touch joystick/camera input using the
   installed Input System; desktop bindings may coexist. Validate camera collision
   without hitting the player's own collider or tunnelling during smoothing.

5. **Complete the original checkpoint checks.** Walk the entire beach-to-clifftop
   route; measure relief and rendering stats; capture the three labelled greybox
   views. Confirm camera defaults and zoom from the GDD. Check Console after each
   change, and re-select the correct Editor if MCP reconnects with a new ID. Never
   fall back to the unrelated Editor to collect evidence. If connection fails,
   save/recover what is safe and return the precise unfinished checks.

## Return and stop

- Stay on `codex/m0-shorelands-foundation`; no main merge or M0-04 work.
- Preserve the prior return in `docs/archive/` before replacing it with this
  session's report. Include implementation SHA, Unity version, changed startup
  boundaries, package delta, saved-scene persistence proof, Console results,
  isolation evidence, traversal/captures and exact CI URL/SHA.
- Run the palette check and relevant Unity tests. Use branch CI for Core if dotnet
  is unavailable locally. Do not equate Core CI with Unity compilation.
- Check staged and committed scene payloads before reporting success. A fresh
  checkout must reproduce the authored hierarchy without unsaved Editor state.
- Report READY FOR REVIEW only when the requested checks pass; otherwise PARTIAL
  or BLOCKED with the precise next action. M0-02/M0-03 remain open until evidence
  closes these findings. Return the final SHA/report to the originating chat.

No Editor was available in the originating review. These findings distinguish
direct repository evidence from hypotheses that the connected session must test;
no Unity runtime fix is claimed by this review document.
