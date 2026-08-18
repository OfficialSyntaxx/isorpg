using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
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
        private const string BuildOutput = "WebGLBuild";
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
            PlayerSettings.colorSpace = ColorSpace.Linear;

            // WebGL 2.0 only. A WebGL 1 fallback costs shader variants we never
            // use, and every device we target has had WebGL 2 for years.
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.WebGL, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.WebGL, new[] { GraphicsDeviceType.OpenGLES3 });

            // ASTC is supported by modern iOS and Android GPUs via
            // WEBGL_compressed_texture_astc.
            EditorUserBuildSettings.webGLBuildSubtarget = WebGLTextureSubtarget.ASTC;

            // --- Behaviour -----------------------------------------------------
            // Without this a backgrounded tab hard-stalls mid-tick.
            PlayerSettings.runInBackground = true;

            PlayerSettings.companyName = "Isoperia";
            PlayerSettings.productName = "Isoperia";

            AssetDatabase.SaveAssets();

            Debug.Log(
                "[Isoperia] WebGL configured: Brotli, exceptions=None, stripping=High, " +
                "heap=320MB, Linear, WebGL2 (GLES3), ASTC, template=" + TemplateName);
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
            camGo.AddComponent<IsometricCamera>();

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

            // A grey ground plane, so the first build renders something and the
            // camera angle is visually checkable.
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground (placeholder)";
            ground.transform.localScale = new Vector3(4.2f, 1f, 4.2f); // 42x42 tiles
            ground.transform.position = new Vector3(21f, 0f, 21f);

            var marker = GameObject.CreatePrimitive(PrimitiveType.Cube);
            marker.name = "Origin marker (placeholder)";
            marker.transform.position = new Vector3(21f, 0.5f, 21f);

            Directory.CreateDirectory(Path.GetDirectoryName(BootstrapScene));
            EditorSceneManager.SaveScene(scene, BootstrapScene);

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(BootstrapScene, true) };
            AssetDatabase.SaveAssets();

            Debug.Log("[Isoperia] Bootstrap scene written to " + BootstrapScene);
        }

        [MenuItem("Isoperia/Build WebGL")]
        public static void BuildWebGL()
        {
            ConfigureWebGL();

            if (!File.Exists(BootstrapScene)) CreateBootstrapScene();

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

            if (summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
                EditorApplication.Exit(1);
        }

        /// <summary>Switches the active platform. Slow the first time — it reimports everything.</summary>
        [MenuItem("Isoperia/Switch to WebGL platform")]
        public static void SwitchPlatform()
        {
            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.WebGL, BuildTarget.WebGL);
        }
    }
}
