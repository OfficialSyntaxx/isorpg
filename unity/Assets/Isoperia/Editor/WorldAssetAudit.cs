using System;
using System.Collections.Generic;
using System.IO;
using Isoperia.Unity;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Isoperia.EditorTools
{
    /// <summary>Inspects imported assets in a disposable preview scene; never grants visual approval.</summary>
    public static class WorldAssetAudit
    {
        [Serializable]
        private sealed class Entry
        {
            public string path;
            public bool admitted;
            public Vector3 boundsSize;
            public int renderers;
            public int triangles;
            public string[] clips;
            public List<string> issues = new List<string>();
        }

        [Serializable]
        private sealed class Report
        {
            public string unityVersion;
            public string scope = "Imported geometry and material checks. Visual, animation and live placement approval still required.";
            public List<Entry> entries = new List<Entry>();
        }

        [MenuItem("Isoperia/Validation/Audit world assets")]
        public static void Run()
        {
            var report = new Report { unityVersion = Application.unityVersion };
            var scene = EditorSceneManager.NewPreviewScene();
            try
            {
                foreach (string path in AssetDatabase.GetAllAssetPaths())
                {
                    if (!path.StartsWith("Assets/", StringComparison.Ordinal)) continue;
                    string extension = Path.GetExtension(path).ToLowerInvariant();
                    if (extension != ".fbx" && extension != ".glb" && extension != ".gltf" &&
                        extension != ".obj" && extension != ".prefab") continue;
                    var entry = new Entry { path = path, admitted = WorldAssetAdmission.IsApproved(ResourcePath(path)) };
                    report.entries.Add(entry);
                    GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    if (prefab == null) { entry.issues.Add("Importer did not produce a GameObject"); continue; }
                    GameObject instance = null;
                    try
                    {
                        instance = PrefabUtility.InstantiatePrefab(prefab, scene) as GameObject;
                        if (instance == null) { entry.issues.Add("Could not instantiate imported asset"); continue; }
                        Inspect(instance, entry);
                        var clips = new List<string>();
                        foreach (UnityEngine.Object asset in AssetDatabase.LoadAllAssetsAtPath(path))
                            if (asset is AnimationClip clip && !clip.name.StartsWith("__preview__", StringComparison.Ordinal))
                                clips.Add(clip.name);
                        entry.clips = clips.ToArray();
                    }
                    catch (Exception error) { entry.issues.Add(error.GetType().Name + ": " + error.Message); }
                    finally { if (instance != null) UnityEngine.Object.DestroyImmediate(instance); }
                }
            }
            finally { EditorSceneManager.ClosePreviewScene(scene); }
            report.entries.Sort((a, b) => string.Compare(a.path, b.path, StringComparison.Ordinal));
            Directory.CreateDirectory("Artifacts");
            string output = "Artifacts/world-asset-import-audit.json";
            File.WriteAllText(output, JsonUtility.ToJson(report, true));
            int failures = 0;
            foreach (Entry entry in report.entries) if (entry.issues.Count > 0) failures++;
            Debug.Log("[Isoperia] Audited " + report.entries.Count + " imported assets; " + failures +
                " need investigation. Report: " + Path.GetFullPath(output) + ". No assets were approved or modified.");
        }

        private static string ResourcePath(string path)
        {
            int index = path.LastIndexOf("/Resources/", StringComparison.Ordinal);
            return index < 0 ? null : path.Substring(index + 11, path.Length - index - 11 - Path.GetExtension(path).Length);
        }

        private static void Inspect(GameObject instance, Entry entry)
        {
            Renderer[] renderers = instance.GetComponentsInChildren<Renderer>(true);
            entry.renderers = renderers.Length;
            if (renderers.Length == 0) entry.issues.Add("No renderers");
            Bounds bounds = new Bounds(instance.transform.position, Vector3.zero);
            bool hasBounds = false;
            foreach (Renderer renderer in renderers)
            {
                if (!hasBounds) { bounds = renderer.bounds; hasBounds = true; }
                else bounds.Encapsulate(renderer.bounds);
                Mesh mesh = renderer is SkinnedMeshRenderer skin ? skin.sharedMesh : renderer.GetComponent<MeshFilter>()?.sharedMesh;
                if (mesh == null) entry.issues.Add(renderer.name + ": no mesh");
                else
                {
                    for (int i = 0; i < mesh.subMeshCount; i++)
                        if (mesh.GetTopology(i) == MeshTopology.Triangles) entry.triangles += (int)mesh.GetIndexCount(i) / 3;
                    if (renderer.sharedMaterials.Length < mesh.subMeshCount) entry.issues.Add(renderer.name + ": missing submesh material slots");
                }
                if (renderer.sharedMaterials.Length == 0) entry.issues.Add(renderer.name + ": no materials");
                foreach (Material material in renderer.sharedMaterials)
                {
                    if (material == null || material.shader == null) entry.issues.Add(renderer.name + ": null material/shader");
                    else if (!material.shader.isSupported || material.shader.name == "Hidden/InternalErrorShader" ||
                        material.shader.name == "Standard" || material.shader.name.StartsWith("Legacy Shaders/", StringComparison.Ordinal))
                        entry.issues.Add(renderer.name + ": inspect URP compatibility of " + material.shader.name);
                }
            }
            entry.boundsSize = bounds.size;
            // Water is an intentionally planar surface; a zero-thickness
            // imported mesh is valid when it is used as a ground/water sheet.
            bool intentionalPlanarSurface = entry.path.IndexOf("/Water/", StringComparison.OrdinalIgnoreCase) >= 0;
            if (!intentionalPlanarSurface && hasBounds &&
                (bounds.size.y < .001f || float.IsNaN(bounds.size.y) || float.IsInfinity(bounds.size.y)))
                entry.issues.Add("Invalid vertical bounds");
            if (instance.GetComponentsInChildren<Camera>(true).Length > 0) entry.issues.Add("Embedded camera");
            if (instance.GetComponentsInChildren<Light>(true).Length > 0) entry.issues.Add("Embedded light");
            foreach (Transform child in instance.GetComponentsInChildren<Transform>(true))
                if (GameObjectUtility.GetMonoBehavioursWithMissingScriptCount(child.gameObject) > 0)
                    entry.issues.Add(child.name + ": missing script");
        }
    }
}
