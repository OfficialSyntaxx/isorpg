#!/usr/bin/env node
// Retired deliberately: old commands must fail before touching authored JSON.
// The historical exporter remains available in git history, not as a write path.
console.error("Content export is retired. Edit unity/Assets/Isoperia/Resources/Content/*.json directly, then run dotnet test ci/CoreTests/CoreTests.csproj --filter ContentValidatorTests. See docs/WORKFLOW.md.");
process.exitCode = 1;
