using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace Isoperia.Core.Save
{
    public enum JsonKind { Null, Bool, Number, String, Array, Object }

    /// <summary>
    /// A minimal JSON value tree, plus a parser and writer.
    ///
    /// Why this exists rather than Newtonsoft: <c>Isoperia.Core</c> is declared
    /// <c>noEngineReferences</c> and has no package dependencies, which is what
    /// lets the whole simulation — including save handling — be compiled and
    /// tested outside Unity. Pulling a serializer in here would end that.
    ///
    /// It also matches what the sanitizer actually needs. The TypeScript
    /// sanitizer operates on <c>unknown</c>: arbitrary, possibly hand-edited,
    /// possibly hostile JSON where any field may be missing or the wrong type.
    /// Deserializing into typed DTOs first would throw or silently coerce before
    /// the sanitizer ever saw the problem. Working on this tree preserves the
    /// original's "inspect and coerce, never throw" behaviour exactly.
    ///
    /// Verified against Node's <c>JSON.parse</c>/<c>stringify</c> over generated
    /// inputs by <c>scripts/verify-json-parity.cjs</c>.
    /// </summary>
    public sealed class JsonValue
    {
        public JsonKind Kind { get; private set; }

        private bool _bool;
        private double _number;
        private string _string;
        private List<JsonValue> _array;
        private Dictionary<string, JsonValue> _object;

        public static readonly JsonValue Null = new JsonValue { Kind = JsonKind.Null };

        public static JsonValue Bool(bool v) => new JsonValue { Kind = JsonKind.Bool, _bool = v };
        public static JsonValue Number(double v) => new JsonValue { Kind = JsonKind.Number, _number = v };
        public static JsonValue String(string v) =>
            v == null ? Null : new JsonValue { Kind = JsonKind.String, _string = v };

        public static JsonValue Array(List<JsonValue> items = null) =>
            new JsonValue { Kind = JsonKind.Array, _array = items ?? new List<JsonValue>() };

        public static JsonValue Object(Dictionary<string, JsonValue> members = null) =>
            new JsonValue { Kind = JsonKind.Object, _object = members ?? new Dictionary<string, JsonValue>() };

        public bool IsNull => Kind == JsonKind.Null;

        public List<JsonValue> Items => _array ?? EmptyArray;
        public Dictionary<string, JsonValue> Members => _object ?? EmptyObject;

        private static readonly List<JsonValue> EmptyArray = new List<JsonValue>();
        private static readonly Dictionary<string, JsonValue> EmptyObject = new Dictionary<string, JsonValue>();

        /// <summary>
        /// Member lookup that never throws and never returns null: a missing key,
        /// or a lookup on a non-object, yields <see cref="Null"/>. This is what
        /// lets the sanitizer read a deeply nested field from a truncated save
        /// without a chain of guards at every level.
        /// </summary>
        public JsonValue this[string key]
        {
            get
            {
                if (Kind != JsonKind.Object) return Null;
                return _object.TryGetValue(key, out JsonValue v) ? v : Null;
            }
        }

        public JsonValue this[int index] =>
            Kind == JsonKind.Array && index >= 0 && index < _array.Count ? _array[index] : Null;

        public int Count =>
            Kind == JsonKind.Array ? _array.Count :
            Kind == JsonKind.Object ? _object.Count : 0;

        // ---- typed reads, each with a fallback; none throw --------------------

        public bool AsBool(bool fallback = false) => Kind == JsonKind.Bool ? _bool : fallback;

        public string AsString(string fallback = null) => Kind == JsonKind.String ? _string : fallback;

        /// <summary>
        /// A number, if this is a finite number. Mirrors the TypeScript's
        /// <c>Number.isFinite</c> check: NaN and infinities are treated as absent,
        /// because a NaN that reaches game state propagates silently forever.
        /// </summary>
        public double AsNumber(double fallback = 0)
        {
            if (Kind != JsonKind.Number) return fallback;
            if (double.IsNaN(_number) || double.IsInfinity(_number)) return fallback;
            return _number;
        }

        public bool IsFiniteNumber =>
            Kind == JsonKind.Number && !double.IsNaN(_number) && !double.IsInfinity(_number);

        public void Add(JsonValue v)
        {
            if (Kind != JsonKind.Array) throw new InvalidOperationException("not an array");
            _array.Add(v);
        }

        public void Set(string key, JsonValue v)
        {
            if (Kind != JsonKind.Object) throw new InvalidOperationException("not an object");
            _object[key] = v;
        }

        // ---- writing ---------------------------------------------------------

        public override string ToString() => Write(this, false);

        public static string Write(JsonValue v, bool indented = false)
        {
            var sb = new StringBuilder();
            WriteTo(sb, v, indented, 0);
            return sb.ToString();
        }

        private static void WriteTo(StringBuilder sb, JsonValue v, bool indented, int depth)
        {
            switch (v.Kind)
            {
                case JsonKind.Null:
                    sb.Append("null");
                    break;

                case JsonKind.Bool:
                    sb.Append(v._bool ? "true" : "false");
                    break;

                case JsonKind.Number:
                    // JSON has no NaN or Infinity; JavaScript's stringify emits
                    // null for them, and matching that keeps round-trips stable.
                    if (double.IsNaN(v._number) || double.IsInfinity(v._number)) sb.Append("null");
                    else sb.Append(FormatNumber(v._number));
                    break;

                case JsonKind.String:
                    WriteString(sb, v._string);
                    break;

                case JsonKind.Array:
                    WriteArray(sb, v, indented, depth);
                    break;

                case JsonKind.Object:
                    WriteObject(sb, v, indented, depth);
                    break;
            }
        }

        private static void WriteArray(StringBuilder sb, JsonValue v, bool indented, int depth)
        {
            if (v._array.Count == 0) { sb.Append("[]"); return; }

            sb.Append('[');
            for (int i = 0; i < v._array.Count; i++)
            {
                if (i > 0) sb.Append(',');
                NewLineIndent(sb, indented, depth + 1);
                WriteTo(sb, v._array[i], indented, depth + 1);
            }
            NewLineIndent(sb, indented, depth);
            sb.Append(']');
        }

        private static void WriteObject(StringBuilder sb, JsonValue v, bool indented, int depth)
        {
            if (v._object.Count == 0) { sb.Append("{}"); return; }

            sb.Append('{');
            bool first = true;
            foreach (var kv in v._object)
            {
                if (!first) sb.Append(',');
                first = false;
                NewLineIndent(sb, indented, depth + 1);
                WriteString(sb, kv.Key);
                sb.Append(':');
                if (indented) sb.Append(' ');
                WriteTo(sb, kv.Value, indented, depth + 1);
            }
            NewLineIndent(sb, indented, depth);
            sb.Append('}');
        }

        private static void NewLineIndent(StringBuilder sb, bool indented, int depth)
        {
            if (!indented) return;
            sb.Append('\n');
            sb.Append(' ', depth * 2);
        }

        /// <summary>
        /// Formats a double the way JavaScript does, which matters because the
        /// save format is shared with the web build's export/import.
        /// "R" round-trips; integral values are written without a decimal point,
        /// and the exponent form is normalised to JavaScript's ("1e+21", not
        /// "1E+21").
        /// </summary>
        private static string FormatNumber(double d)
        {
            if (d == Math.Floor(d) && Math.Abs(d) < 1e15)
                return ((long)d).ToString(CultureInfo.InvariantCulture);

            string s = d.ToString("R", CultureInfo.InvariantCulture).Replace("E", "e");

            // .NET pads the exponent to at least two digits ("-2.5e-08") where
            // JavaScript does not ("-2.5e-8"). Left alone, every save written by
            // the C# build would differ textually from one written by the web
            // build for the same values.
            int e = s.IndexOf('e');
            if (e < 0) return s;

            string mantissa = s.Substring(0, e);
            string exp = s.Substring(e + 1);

            string sign = "";
            if (exp.Length > 0 && (exp[0] == '+' || exp[0] == '-'))
            {
                sign = exp[0] == '-' ? "-" : "+";
                exp = exp.Substring(1);
            }

            exp = exp.TrimStart('0');
            if (exp.Length == 0) exp = "0";

            return mantissa + "e" + sign + exp;
        }

        private static void WriteString(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        else sb.Append(c);
                        break;
                }
            }
            sb.Append('"');
        }

        // ---- parsing ---------------------------------------------------------

        /// <summary>
        /// Parses JSON. Returns null on malformed input rather than throwing —
        /// the caller is loading a possibly corrupt save and wants to fall through
        /// to a backup, not to crash on the way in.
        /// </summary>
        public static JsonValue Parse(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;

            try
            {
                int i = 0;
                JsonValue v = ParseValue(text, ref i);
                SkipWhitespace(text, ref i);
                if (i != text.Length) return null;   // trailing garbage
                return v;
            }
            catch (Exception)
            {
                return null;
            }
        }

        private static void SkipWhitespace(string s, ref int i)
        {
            while (i < s.Length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++;
        }

        private static JsonValue ParseValue(string s, ref int i)
        {
            SkipWhitespace(s, ref i);
            if (i >= s.Length) throw new FormatException("unexpected end");

            switch (s[i])
            {
                case '{': return ParseObject(s, ref i);
                case '[': return ParseArray(s, ref i);
                case '"': return String(ParseString(s, ref i));
                case 't': Expect(s, ref i, "true"); return Bool(true);
                case 'f': Expect(s, ref i, "false"); return Bool(false);
                case 'n': Expect(s, ref i, "null"); return Null;
                default: return Number(ParseNumber(s, ref i));
            }
        }

        private static void Expect(string s, ref int i, string literal)
        {
            if (i + literal.Length > s.Length || string.CompareOrdinal(s, i, literal, 0, literal.Length) != 0)
                throw new FormatException("bad literal");
            i += literal.Length;
        }

        private static JsonValue ParseObject(string s, ref int i)
        {
            i++; // '{'
            var obj = new Dictionary<string, JsonValue>();
            SkipWhitespace(s, ref i);

            if (i < s.Length && s[i] == '}') { i++; return Object(obj); }

            while (true)
            {
                SkipWhitespace(s, ref i);
                if (i >= s.Length || s[i] != '"') throw new FormatException("expected key");

                string key = ParseString(s, ref i);
                SkipWhitespace(s, ref i);

                if (i >= s.Length || s[i] != ':') throw new FormatException("expected ':'");
                i++;

                // A duplicate key overwrites, matching JavaScript.
                obj[key] = ParseValue(s, ref i);

                SkipWhitespace(s, ref i);
                if (i >= s.Length) throw new FormatException("unterminated object");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; return Object(obj); }
                throw new FormatException("expected ',' or '}'");
            }
        }

        private static JsonValue ParseArray(string s, ref int i)
        {
            i++; // '['
            var arr = new List<JsonValue>();
            SkipWhitespace(s, ref i);

            if (i < s.Length && s[i] == ']') { i++; return Array(arr); }

            while (true)
            {
                arr.Add(ParseValue(s, ref i));
                SkipWhitespace(s, ref i);

                if (i >= s.Length) throw new FormatException("unterminated array");
                if (s[i] == ',') { i++; continue; }
                if (s[i] == ']') { i++; return Array(arr); }
                throw new FormatException("expected ',' or ']'");
            }
        }

        private static string ParseString(string s, ref int i)
        {
            i++; // opening quote
            var sb = new StringBuilder();

            while (true)
            {
                if (i >= s.Length) throw new FormatException("unterminated string");
                char c = s[i++];

                if (c == '"') return sb.ToString();

                if (c != '\\') { sb.Append(c); continue; }

                if (i >= s.Length) throw new FormatException("unterminated escape");
                char e = s[i++];

                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 > s.Length) throw new FormatException("bad \\u");
                        // Surrogate pairs need no special handling: each half is a
                        // UTF-16 code unit and C# strings are UTF-16, so appending
                        // both in sequence reconstructs the character.
                        sb.Append((char)ushort.Parse(s.Substring(i, 4), NumberStyles.HexNumber,
                            CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default:
                        throw new FormatException("bad escape");
                }
            }
        }

        /// <summary>
        /// Parses a number against JSON's grammar exactly:
        ///
        ///   -? ( 0 | [1-9][0-9]* ) ( '.' [0-9]+ )? ( [eE] [+-]? [0-9]+ )?
        ///
        /// Strictness is the point. A permissive scan that just consumed digits
        /// and punctuation would accept "01", "+1", ".5" and "1." — none of which
        /// are JSON. Accepting them means a corrupted or hand-edited save parses
        /// into something plausible instead of being rejected and recovered from
        /// the backup, which is the whole reason the load path has a backup.
        /// </summary>
        private static double ParseNumber(string s, ref int i)
        {
            int start = i;

            if (i < s.Length && s[i] == '-') i++;   // leading '+' is not JSON

            // Integer part: a lone 0, or a non-zero digit followed by any digits.
            if (i >= s.Length) throw new FormatException("expected number");

            if (s[i] == '0')
            {
                i++;
            }
            else if (s[i] >= '1' && s[i] <= '9')
            {
                while (i < s.Length && s[i] >= '0' && s[i] <= '9') i++;
            }
            else
            {
                throw new FormatException("expected digit");
            }

            // Fraction: at least one digit after the point.
            if (i < s.Length && s[i] == '.')
            {
                i++;
                if (i >= s.Length || s[i] < '0' || s[i] > '9') throw new FormatException("expected digit after '.'");
                while (i < s.Length && s[i] >= '0' && s[i] <= '9') i++;
            }

            // Exponent: optional sign, then at least one digit.
            if (i < s.Length && (s[i] == 'e' || s[i] == 'E'))
            {
                i++;
                if (i < s.Length && (s[i] == '+' || s[i] == '-')) i++;
                if (i >= s.Length || s[i] < '0' || s[i] > '9') throw new FormatException("expected exponent digits");
                while (i < s.Length && s[i] >= '0' && s[i] <= '9') i++;
            }

            return double.Parse(s.Substring(start, i - start),
                NumberStyles.Float, CultureInfo.InvariantCulture);
        }
    }
}
