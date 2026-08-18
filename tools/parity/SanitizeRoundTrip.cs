// Harness: reads base64-encoded save documents on stdin (one per line), runs each
// through the C# Sanitizer, and writes the sanitized result back as JSON, one per
// line. "REJECTED" when the sanitizer refuses the input.
//
// scripts/verify-sanitizer-parity.cjs feeds the same corpus through the
// TypeScript sanitizeSave() and compares. The sanitizer is dozens of independent
// coercion rules over untrusted input, with no natural test oracle, so checking
// it against the implementation it was ported from is worth more than any number
// of hand-written assertions.
//
// A fixed "now" is passed in so time-dependent rules (a future plantedAt, a
// missing timestamp) are deterministic on both sides.
using System;
using System.Text;
using Isoperia.Core.Save;

public static class SanitizeRoundTrip
{
    /// <summary>Must match NOW in the JavaScript driver.</summary>
    private const long Now = 1787000000000L;

    public static void Main()
    {
        Console.OutputEncoding = new UTF8Encoding(false);

        string line;
        while ((line = Console.In.ReadLine()) != null)
        {
            string doc;
            try
            {
                doc = Encoding.UTF8.GetString(Convert.FromBase64String(line.Trim()));
            }
            catch (Exception)
            {
                Console.Out.WriteLine("BAD_INPUT");
                continue;
            }

            JsonValue parsed = JsonValue.Parse(doc);

            SanitizeResult res;
            try
            {
                res = Sanitizer.Sanitize(parsed, Now);
            }
            catch (Exception e)
            {
                // The sanitizer's entire contract is that it never throws, so
                // surface this loudly rather than letting it look like a mismatch.
                Console.Out.WriteLine("THREW: " + e.GetType().Name + ": " + e.Message.Replace("\n", " "));
                continue;
            }

            Console.Out.WriteLine(res.Ok ? JsonValue.Write(res.State) : "REJECTED");
        }
    }
}
