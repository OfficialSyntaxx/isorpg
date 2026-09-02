using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace Isoperia.Unity.Editor
{
    /// <summary>Builds the isolated M0 proof with an explicit startup define.</summary>
    public static class M0InspectionBuild
    {
        [MenuItem("Isoperia/M0/Build Inspection Player")]
        public static void BuildInspectionPlayer()
        {
            var options = new BuildPlayerOptions
            {
                scenes = new[] { M0InspectionStartup.ScenePath },
                locationPathName = "Builds/M0Inspection/M0Inspection.app",
                target = BuildTarget.StandaloneOSX,
                options = BuildOptions.None,
                extraScriptingDefines = new[] { "ISOPERIA_M0_INSPECTION" }
            };
            BuildReport report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != BuildResult.Succeeded)
                Debug.LogError("M0 inspection player build failed: " + report.summary.result);
        }
    }
}
