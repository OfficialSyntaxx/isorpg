// Harness: reads base64-encoded JSON documents on stdin (one per line), parses
// each with our JsonValue, and writes the re-serialized form back, one per line.
//
// scripts/verify-json-parity.cjs feeds it documents, does the same round trip
// through Node's JSON.parse/JSON.stringify, and compares. That checks our parser
// and writer against the reference implementation the save format came from,
// over inputs including escapes, unicode, deep nesting and awkward numbers.
//
// Base64 rather than raw lines: documents may legitimately be empty, or contain
// newlines. Line framing silently drops the empty one, which shifts every later
// result by one and turns the comparison into nonsense that looks like ten
// unrelated parser bugs.
using System;
using System.Text;
using Isoperia.Core.Save;

public static class JsonRoundTrip
{
    public static void Main()
    {
        // Mono defaults the console to the ambient locale's encoding, which
        // mangles non-ASCII output to '?' and would look like a unicode bug in
        // the parser rather than in the harness.
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

            JsonValue v = JsonValue.Parse(doc);
            Console.Out.WriteLine(v == null ? "PARSE_ERROR" : JsonValue.Write(v));
        }
    }
}
