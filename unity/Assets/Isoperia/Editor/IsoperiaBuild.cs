using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Isoperia.Unity;

namespace Isoperia.EditorTools
{
    /// <summary>
    /// Project configuration and build, as code rather than as thirty inspector
    /// fields somebody has to remember.
    ///
    /// Every value here is pinned by docs/PORTING_SPEC.md or by the WebGL budget
    /// in docs/UNITY_MIGRATION.md. Setting them by hand is error-prone and
    /// invisible in review; setting them here means the configuration is diffable
    /// and a fresh clone can reproduce the exact build.
    ///
    /// Run headless:
    ///   Unity -quit -batchmode -nographics -projectPath unity \
    ///         -executeMethod Isoperia.EditorTools.IsoperiaBuild.ConfigureWebGL
    ///
    /// If a symbol below does not exist in your Unity version, the API was
    /// renamed — fix that one line rather than abandoning the script. The manual
    /// equivalent for every setting is tabulated in docs/UNITY_SETUP.md §2.
    /// </summary>
    public static class IsoperiaBuild
    {
        private const string BootstrapScene = "Assets/Isoperia/Scenes/Bootstrap.unity";

        /// <summary>
        /// Middle of the 42x42 map. World coordinates are tile coordinates, so
        /// the origin is the map's CORNER, not its centre — a camera left looking
        /// at Vector3.zero frames the edge of the world.
        /// </summary>
        private static readonly Vector3 WorldCentre = new Vector3(21f, 0f, 21f);
        private const string BuildOutput = "WebGLBuild";
        private const string SettingsDir = "Assets/Isoperia/Settings";
        private const string MaterialsDir = "Assets/Isoperia/Materials";
        private const string PipelineAsset = SettingsDir + "/IsoperiaURP.asset";
        private const string RendererData = SettingsDir + "/IsoperiaURP_Renderer.asset";
        private const string UrpLitShader = "Universal Render Pipeline/Lit";
        private const string TemplateName = "PROJECT:IsoperiaPWA";

        [MenuItem("Isoperia/Configure WebGL settings")]
        public static void ConfigureWebGL()
        {
            // --- Payload -------------------------------------------------------
            // Brotli is ~20% smaller than gzip; the template's _headers file
            // already declares Content-Encoding for it.
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Brotli;

            // The fallback decompressor only earns its size on hosts that cannot
            // set headers. Netlify and Vercel can, so it is dead weight.
            PlayerSettings.WebGL.decompressionFallback = false;

            // Exception support is a large, slow addition to the WASM. Use
            // ExplicitlyThrownExceptionsOnly while debugging, never for release.
            PlayerSettings.WebGL.exceptionSupport = WebGLExceptionSupport.None;

            PlayerSettings.WebGL.dataCaching = true;
            PlayerSettings.WebGL.template = TemplateName;

            // --- Memory --------------------------------------------------------
            // 320 MB sits inside the 256-384 MB budget. Too high and iOS Safari
            // kills the tab outright, which presents as a silent reload.
            PlayerSettings.WebGL.initialMemorySize = 320;
            PlayerSettings.WebGL.memoryGrowthMode = WebGLMemoryGrowthMode.Geometric;

            // --- Code size -----------------------------------------------------
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.WebGL, ManagedStrippingLevel.High);
            PlayerSettings.stripEngineCode = true;

            // --- Rendering -----------------------------------------------------
            // Must come before anything reads GraphicsSettings: the project ships
            // no pipeline asset of its own, and without one every URP material in
            // the scene renders magenta.
            ConfigureRenderPipeline();

            PlayerSettings.colorSpace = ColorSpace.Linear;

            // WebGL 2.0 only. A WebGL 1 fallback costs shader variants we never
            // use, and every device we target has had WebGL 2 for years.
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });

            // ASTC is supported by modern iOS and Android GPUs via
            // WEBGL_compressed_texture_astc.
            //
            // READ THE VALUE BACK. This assignment does not always stick: the
            // field lives in Library/, which is not version-controlled, and both
            // Phase 1 build reports recorded "Generic" despite this line running
            // immediately beforehand. That costs nothing while the build has no
            // textures, and costs the entire memory budget in Phase 5 — an
            // uncompressed atlas is several times the size of its ASTC form, and
            // nothing anywhere would say so. Warn now rather than discover it
            // when the heap starts killing iOS tabs.
            EditorUserBuildSettings.webGLBuildSubtarget = WebGLTextureSubtarget.ASTC;

            if (EditorUserBuildSettings.webGLBuildSubtarget != WebGLTextureSubtarget.ASTC)
            {
                Debug.LogWarning(
                    "[Isoperia] texture subtarget did not stick: asked for ASTC, got " +
                    EditorUserBuildSettings.webGLBuildSubtarget + ". Textures will build " +
                    "UNCOMPRESSED. Harmless while the build has none; a memory-budget " +
                    "failure once Phase 5 art lands. Set Build Profiles > WebGL > Texture " +
                    "Compression to ASTC by hand and re-check unity/build-report.txt.");
            }

            // --- Behaviour -----------------------------------------------------
            // Without this a backgrounded tab hard-stalls mid-tick.
            PlayerSettings.runInBackground = true;

            PlayerSettings.companyName = "Isoperia";
            PlayerSettings.productName = "Isoperia";

            AssetDatabase.SaveAssets();

            Debug.Log(
                "[Isoperia] WebGL configured: Brotli, exceptions=None, stripping=High, " +
                "heap=320MB, Linear, WebGL2 (GLES3), ASTC, URP, template=" + TemplateName);
        }

        /// <summary>
        /// Builds the bootstrap scene: an isometric camera, the tick bridge, and a
        /// sun. Deliberately minimal — it exists to prove the pipeline end to end,
        /// and Phase 2b onward will grow it.
        /// </summary>
        [MenuItem("Isoperia/Create bootstrap scene")]
        public static void CreateBootstrapScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // Camera. IsometricCamera writes projection, size, rotation and clip
            // planes in Awake, so nothing here should be hand-tuned.
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.orthographicSize = IsometricCamera.OrthographicSize;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 1000f;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.10f, 0.086f, 0.063f); // matches the PWA shell
            // Point it at the middle of the world.
            //
            // IsometricCamera defaults its Target to Vector3.zero, and world
            // coordinates are tile coordinates, so origin is the CORNER of a
            // 42x42 map rather than anywhere useful. Leaving it there framed the
            // corner of the ground plane and nothing else — the first device load
            // showed a white wedge on a brown field and looked like a broken
            // build when in fact everything was rendering correctly.
            var isoCam = camGo.AddComponent<IsometricCamera>();
            isoCam.Target = WorldCentre;

            // Sun, angled to read against the fixed camera rather than to be
            // physically plausible.
            var sunGo = new GameObject("Sun");
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.1f;
            sun.shadows = LightShadows.Hard;   // soft shadows are expensive on WebGL
            sunGo.transform.rotation = Quaternion.Euler(50f, -30f, 0f);

            // The tick bridge.
            var loopGo = new GameObject("GameLoop");
            loopGo.AddComponent<GameLoop>();

            // The save system. Without this object in the scene nothing loads on
            // startup, nothing autosaves, and the WebGL IndexedDB flush is never
            // installed — so every session's progress is lost silently, with no
            // error anywhere. It is named by GameObjectName because the JavaScript
            // lifecycle bridge addresses it by name.
            var saveGo = new GameObject(SaveDriver.GameObjectName);
            saveGo.AddComponent<SaveDriver>();

            // Ground: 42x42 tiles, corner at the origin so world coordinates and
            // tile coordinates are the same thing.
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground (placeholder)";
            ground.transform.localScale = new Vector3(4.2f, 1f, 4.2f);  // Plane is 10 units
            ground.transform.position = WorldCentre;
            Paint(ground, "Ground", new Color(0.31f, 0.35f, 0.24f));   // muted meadow, not Unity white

            // Reference cubes.
            //
            // A flat plane cannot show whether the projection is right — it looks
            // the same at any pitch. A UNIT CUBE can: under a true 2:1 isometric
            // view its top face projects to a diamond exactly twice as wide as it
            // is tall, and its two visible side faces are mirror images. That is
            // the check `docs/EDITOR_LANE.md` asks for, and it is not verifiable
            // without something three-dimensional on screen.
            //
            // Placed on a known diagonal so the tile grid's orientation is legible
            // too: the row should recede toward the top-right of the screen.
            for (int i = 0; i < 5; i++)
            {
                int t = 17 + i * 2;
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = $"Reference cube ({t},{t})";
                cube.transform.position = new Vector3(t + 0.5f, 0.5f, t + 0.5f);
                Paint(cube, i == 2 ? "ReferenceAccent" : "ReferenceStone",
                      i == 2
                          ? new Color(0.79f, 0.64f, 0.15f)    // the centre one, in the accent gold
                          : new Color(0.62f, 0.60f, 0.55f));
            }

            // One tall marker at the player's spawn tile, so the default start
            // position is obvious on screen.
            var spawn = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            spawn.name = "Spawn marker (placeholder)";
            spawn.transform.position = new Vector3(10.5f, 1f, 10.5f);
            Paint(spawn, "SpawnMarker", new Color(0.91f, 0.86f, 0.78f));

            Directory.CreateDirectory(Path.GetDirectoryName(BootstrapScene));
            EditorSceneManager.SaveScene(scene, BootstrapScene);

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(BootstrapScene, true) };
            AssetDatabase.SaveAssets();

            Debug.Log("[Isoperia] Bootstrap scene written to " + BootstrapScene);
        }

        /// <summary>
        /// Gives a primitive a flat colour, using a real material ASSET.
        ///
        /// Two things here are load-bearing and both were learned the hard way.
        ///
        /// FIRST: the shader must match the ACTIVE render pipeline, and
        /// Shader.Find does not tell you what that is. The URP package being
        /// installed makes "Universal Render Pipeline/Lit" findable whether or
        /// not URP is actually driving rendering — so the previous
        ///     Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard")
        /// always took the first branch, and the project had no pipeline asset
        /// assigned, so every URP shader rendered as Unity's magenta error
        /// colour. On device that was a giant pink shape filling the screen and
        /// it looked like a broken build. Ask GraphicsSettings which pipeline is
        /// live; do not infer it from a shader existing.
        ///
        /// SECOND: these are saved as .mat assets rather than materials
        /// constructed at runtime. An asset carries a tracked dependency on its
        /// shader, which is what keeps the shader out of the WebGL build's
        /// stripping pass.
        ///
        /// If no usable shader is found this THROWS. A silent return here ships
        /// a magenta build, and a build that fails loudly in CI is cheaper than
        /// one that fails quietly on somebody's phone.
        /// </summary>
        private static void Paint(GameObject go, string materialName, Color colour)
        {
            bool scriptable = GraphicsSettings.currentRenderPipeline != null ||
                              GraphicsSettings.defaultRenderPipeline != null;

            string shaderName = scriptable ? UrpLitShader : "Standard";
            Shader shader = Shader.Find(shaderName);

            if (shader == null)
            {
                throw new BuildFailedException(
                    $"[Isoperia] shader \"{shaderName}\" not found. The active render pipeline is " +
                    (scriptable ? "scriptable (URP)" : "built-in") +
                    ". Refusing to build a scene that would render magenta.");
            }

            Directory.CreateDirectory(MaterialsDir);
            string path = $"{MaterialsDir}/{materialName}.mat";

            var mat = new Material(shader);
            mat.color = colour;    // maps to _BaseColor on URP/Lit, _Color on Standard

            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mat, path);

            go.GetComponent<Renderer>().sharedMaterial =
                AssetDatabase.LoadAssetAtPath<Material>(path);
        }

        /// <summary>
        /// Creates and assigns a URP pipeline asset if the project has none.
        ///
        /// The project was scaffolded from Unity's plain 3D template with the URP
        /// package added but never configured: ProjectSettings/GraphicsSettings
        /// had m_CustomRenderPipeline: {fileID: 0} and every quality level had
        /// customRenderPipeline: {fileID: 0}. Having the package is not the same
        /// as having the pipeline, and nothing warns you — URP materials simply
        /// render magenta, in the Editor and on device alike.
        ///
        /// Everything from Phase 4 onward (the art bible's single URP material
        /// family, ASTC textures, baked lighting) assumes URP, so the fix is to
        /// assign the pipeline rather than to retreat to the built-in shaders.
        /// </summary>
        [MenuItem("Isoperia/Configure render pipeline")]
        public static void ConfigureRenderPipeline()
        {
            var existing = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelineAsset);
            UniversalRenderPipelineAsset urp = existing;

            if (urp == null)
            {
                Directory.CreateDirectory(SettingsDir);

                var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(rendererData, RendererData);

                urp = UniversalRenderPipelineAsset.Create(rendererData);
                AssetDatabase.CreateAsset(urp, PipelineAsset);
            }

            // WebGL budget. These are the expensive knobs on a mobile browser and
            // are pinned by docs/UNITY_MIGRATION.md's perf constraints rather
            // than chosen for looks.
            urp.msaaSampleCount = 1;                     // off; fill-rate is the scarce thing
            urp.supportsHDR = false;                     // no HDR framebuffer on this budget
            urp.shadowDistance = 40f;                    // the iso frustum sees ~30 units
            urp.shadowCascadeCount = 1;
            urp.supportsCameraDepthTexture = false;
            urp.supportsCameraOpaqueTexture = false;

            EditorUtility.SetDirty(urp);

            GraphicsSettings.defaultRenderPipeline = urp;

            // QualitySettings.renderPipeline only touches the CURRENT level, and
            // a level left null silently falls back to the built-in pipeline —
            // i.e. magenta again, but only for whoever lands on that level.
            int previous = QualitySettings.GetQualityLevel();
            try
            {
                for (int i = 0; i < QualitySettings.names.Length; i++)
                {
                    QualitySettings.SetQualityLevel(i, applyExpensiveChanges: false);
                    QualitySettings.renderPipeline = urp;
                }
            }
            finally
            {
                QualitySettings.SetQualityLevel(previous, applyExpensiveChanges: false);
            }

            AssetDatabase.SaveAssets();

            Debug.Log($"[Isoperia] render pipeline: {(existing == null ? "created" : "reused")} " +
                      $"{PipelineAsset}, assigned to graphics defaults and all " +
                      $"{QualitySettings.names.Length} quality levels.");
        }

        /// <summary>
        /// Refuses to build if the scene would render magenta.
        ///
        /// The whole class of failure this guards is invisible from a build log:
        /// the build succeeds, the deploy succeeds, the headers check out, and
        /// the game is a pink shape. So check the two conditions that produce it
        /// — a URP material with no pipeline assigned, or a built-in material
        /// under URP — and fail the build instead.
        /// </summary>
        private static void AssertRenderPipelineMatchesMaterials()
        {
            bool scriptable = GraphicsSettings.currentRenderPipeline != null ||
                              GraphicsSettings.defaultRenderPipeline != null;

            foreach (string guid in AssetDatabase.FindAssets("t:Material", new[] { MaterialsDir }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (mat == null || mat.shader == null) continue;

                bool matIsUrp = mat.shader.name.StartsWith("Universal Render Pipeline/",
                                                           System.StringComparison.Ordinal);

                if (matIsUrp != scriptable)
                {
                    throw new BuildFailedException(
                        $"[Isoperia] {path} uses shader \"{mat.shader.name}\" but the active " +
                        $"render pipeline is {(scriptable ? "scriptable (URP)" : "built-in")}. " +
                        "This renders magenta. Run Isoperia/Configure render pipeline, then " +
                        "Isoperia/Create bootstrap scene.");
                }
            }
        }

        [MenuItem("Isoperia/Build WebGL")]
        public static void BuildWebGL()
        {
            ConfigureWebGL();

            if (!File.Exists(BootstrapScene)) CreateBootstrapScene();

            AssertRenderPipelineMatchesMaterials();

            var options = new BuildPlayerOptions
            {
                scenes = new[] { BootstrapScene },
                locationPathName = BuildOutput,
                target = BuildTarget.WebGL,
                // Explicitly NOT BuildOptions.Development: a development build is
                // far larger and slower, and its console output is visible to
                // players.
                options = BuildOptions.None,
            };

            var report = BuildPipeline.BuildPlayer(options);
            var summary = report.summary;

            Debug.Log($"[Isoperia] Build {summary.result}: " +
                      $"{summary.totalSize / (1024 * 1024)} MB in {summary.totalTime}");

            StripDoNotShipArtifacts();
            string buildId = StampBuildId();
            WriteBuildReport(summary, buildId);

            if (summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                EditorApplication.Exit(1);
        }

        /// <summary>
        /// Replaces the __BUILD_ID__ placeholder in the built ServiceWorker.js
        /// with a value unique to this build, and writes it to build-id.txt.
        ///
        /// This is what makes a redeploy actually reach a returning browser, and
        /// the reason it has to work this way is worth stating: a browser only
        /// installs a new service worker when the worker FILE'S BYTES change. The
        /// cache used to be keyed on the Unity product version, which stayed at
        /// 1.0 forever — so the bytes never changed, no new worker was installed,
        /// and the old one kept serving the first build it ever cached. Several
        /// deploys landed correctly on the host and none of them were visible on
        /// a device that had loaded the site once.
        ///
        /// Stamping here rather than in the template is deliberate: Unity's
        /// template macros expose the product name and version but nothing that
        /// varies per build, so no macro could have done this.
        /// </summary>
        /// <returns>The build id, for the report.</returns>
        private static string StampBuildId()
        {
            string buildId = System.DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") +
                             "-" + System.Guid.NewGuid().ToString("N").Substring(0, 8);
            try
            {
                string swPath = Path.Combine(BuildOutput, "ServiceWorker.js");

                if (File.Exists(swPath))
                {
                    string sw = File.ReadAllText(swPath);

                    if (sw.Contains("__BUILD_ID__"))
                    {
                        File.WriteAllText(swPath, sw.Replace("__BUILD_ID__", buildId));
                    }
                    else
                    {
                        // Loud, because silence here means every future deploy is
                        // invisible to anyone who has already visited.
                        Debug.LogError(
                            "[Isoperia] ServiceWorker.js has no __BUILD_ID__ placeholder. Cache " +
                            "busting is DISABLED and returning visitors will keep the old build. " +
                            "Restore the placeholder in the WebGL template.");
                    }
                }
                else
                {
                    Debug.LogWarning("[Isoperia] no ServiceWorker.js in the build output to stamp.");
                }

                File.WriteAllText(Path.Combine(BuildOutput, "build-id.txt"), buildId + "\n");
            }
            catch (System.Exception e)
            {
                Debug.LogError("[Isoperia] could not stamp the build id: " + e.Message);
            }

            Debug.Log("[Isoperia] build id: " + buildId);
            return buildId;
        }

        /// <summary>
        /// Deletes the Burst debug folder Unity emits beside the build.
        ///
        /// Unity names it "..._BurstDebugInformation_DoNotShip" and then ships it
        /// anyway if you deploy the output directory wholesale, which is exactly
        /// what our deploy step does. It is only ~77 kB today so this is tidiness
        /// rather than a size problem — but it is unobfuscated internal build
        /// information sitting on a public host, and the cost of not shipping it
        /// is one directory delete.
        /// </summary>
        private static void StripDoNotShipArtifacts()
        {
            try
            {
                if (!Directory.Exists(BuildOutput)) return;

                foreach (string dir in Directory.GetDirectories(BuildOutput))
                {
                    if (!Path.GetFileName(dir).EndsWith("DoNotShip", System.StringComparison.Ordinal)) continue;

                    Directory.Delete(dir, recursive: true);
                    Debug.Log("[Isoperia] removed from the build output: " + Path.GetFileName(dir));
                }
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[Isoperia] could not strip DoNotShip artifacts: " + e.Message);
            }
        }

        /// <summary>
        /// Writes what the build actually did to a committed text file.
        ///
        /// This exists because a build is otherwise unverifiable from the repo:
        /// `WebGLBuild/` is git-ignored by design, so anyone reviewing a commit
        /// has no way to tell whether a build happened, what settings it used, or
        /// how big it came out. Two Editor-lane handoffs in a row reported none of
        /// that, and a broken scene shipped unnoticed as a result.
        ///
        /// Making the evidence a file the build produces — rather than something a
        /// person has to remember to paste — is what stops that recurring. The
        /// report is small, plain text, and diffs usefully between builds.
        /// </summary>
        private static void WriteBuildReport(UnityEditor.Build.Reporting.BuildSummary summary, string buildId)
        {
            try
            {
                var sb = new System.Text.StringBuilder();
                var inv = System.Globalization.CultureInfo.InvariantCulture;

                sb.AppendLine("# Isoperia WebGL build report");
                sb.AppendLine("# Generated by IsoperiaBuild.BuildWebGL. Commit this file.");
                sb.AppendLine();
                sb.AppendLine("built_at_utc:      " + System.DateTime.UtcNow.ToString("u", inv));
                sb.AppendLine("build_id:          " + buildId + "   (stamped into ServiceWorker.js; this is what busts the cache)");
                sb.AppendLine("unity_version:     " + Application.unityVersion);
                sb.AppendLine("result:            " + summary.result);
                sb.AppendLine("total_time:        " + summary.totalTime);
                sb.AppendLine("total_size_bytes:  " + summary.totalSize.ToString(inv));
                sb.AppendLine("total_size_mb:     " + (summary.totalSize / (1024.0 * 1024.0)).ToString("F2", inv));
                sb.AppendLine("output_path:       " + summary.outputPath);
                sb.AppendLine();

                sb.AppendLine("## Settings actually applied");
                sb.AppendLine("compression:       " + PlayerSettings.WebGL.compressionFormat);
                sb.AppendLine("exceptions:        " + PlayerSettings.WebGL.exceptionSupport);
                sb.AppendLine("stripping:         " +
                    PlayerSettings.GetManagedStrippingLevel(NamedBuildTarget.WebGL));
                sb.AppendLine("initial_memory_mb: " + PlayerSettings.WebGL.initialMemorySize.ToString(inv));
                sb.AppendLine("decompress_fallbk: " + PlayerSettings.WebGL.decompressionFallback);
                sb.AppendLine("data_caching:      " + PlayerSettings.WebGL.dataCaching);
                sb.AppendLine("template:          " + PlayerSettings.WebGL.template);
                sb.AppendLine("colour_space:      " + PlayerSettings.colorSpace);
                var subtarget = EditorUserBuildSettings.webGLBuildSubtarget;
                sb.AppendLine("texture_subtarget: " + subtarget +
                              (subtarget == WebGLTextureSubtarget.ASTC
                                   ? ""
                                   : "   << WANTED ASTC. Textures build UNCOMPRESSED; see ConfigureWebGL."));
                sb.AppendLine("run_in_background: " + PlayerSettings.runInBackground);
                sb.AppendLine();

                // The single most common failure is Unity quietly falling back to
                // its default template, which drops the PWA manifest and the host
                // header rules. Listing the output makes that visible in review.
                sb.AppendLine("## Output contents");
                if (Directory.Exists(BuildOutput))
                {
                    foreach (string path in Directory.GetFiles(BuildOutput, "*", SearchOption.AllDirectories))
                    {
                        string rel = path.Substring(BuildOutput.Length).TrimStart('/', '\\').Replace('\\', '/');
                        long bytes = new FileInfo(path).Length;
                        sb.AppendLine($"{rel,-52} {bytes,12} bytes");
                    }
                }
                else
                {
                    sb.AppendLine("(build output directory not found)");
                }

                sb.AppendLine();
                sb.AppendLine("## Cache busting");
                try
                {
                    string swPath = Path.Combine(BuildOutput, "ServiceWorker.js");
                    string sw = File.Exists(swPath) ? File.ReadAllText(swPath) : "";
                    bool stamped = sw.Contains(buildId);
                    bool placeholderLeft = sw.Contains("__BUILD_ID__");

                    sb.AppendLine("service worker stamped: " + (stamped ? "yes" : "NO"));
                    if (placeholderLeft || !stamped)
                    {
                        sb.AppendLine("  WARNING: returning visitors will keep the OLD build.");
                        sb.AppendLine("  A browser only installs a new service worker when the");
                        sb.AppendLine("  worker file's bytes change, so an unstamped worker means");
                        sb.AppendLine("  every future deploy is invisible to anyone who has");
                        sb.AppendLine("  already loaded the site.");
                    }
                }
                catch (System.Exception e)
                {
                    sb.AppendLine("could not verify: " + e.Message);
                }

                sb.AppendLine();
                sb.AppendLine("## PWA template files present");
                foreach (string required in new[]
                    { "index.html", "manifest.webmanifest", "ServiceWorker.js", "_headers", "vercel.json" })
                {
                    bool present = File.Exists(Path.Combine(BuildOutput, required));
                    sb.AppendLine($"{required,-24} {(present ? "yes" : "NO -- default template was used")}");
                }

                File.WriteAllText("build-report.txt", sb.ToString());
                Debug.Log("[Isoperia] build report written to unity/build-report.txt");
            }
            catch (System.Exception e)
            {
                // A failed report must never fail the build.
                Debug.LogWarning("[Isoperia] could not write the build report: " + e.Message);
            }
        }

        /// <summary>Switches the active platform. Slow the first time — it reimports everything.</summary>
        [MenuItem("Isoperia/Switch to WebGL platform")]
        public static void SwitchPlatform()
        {
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
        }
    }
}
