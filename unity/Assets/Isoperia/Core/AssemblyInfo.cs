using System.Runtime.CompilerServices;

// Lets Isoperia.Core.Tests call `internal` members (e.g. Sanitizer.OlderThan)
// without widening them to public just for test access.
[assembly: InternalsVisibleTo("Isoperia.Core.Tests")]
