// A minimal NUnit-compatible shim, used ONLY to execute the EditMode tests
// outside Unity so they are verified before anyone opens the Editor.
//
// It deliberately lives outside Assets/ — inside, Unity would compile it and it
// would collide with the real NUnit that ships with the Test Framework package.
// The tests themselves are written against the genuine NUnit API and are not
// modified for this: if a construct is not supported here, the shim grows.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;

namespace NUnit.Framework
{
    [AttributeUsage(AttributeTargets.Method)] public sealed class TestAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Method)] public sealed class SetUpAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Method)] public sealed class TearDownAttribute : Attribute { }

    public class AssertionException : Exception
    {
        public AssertionException(string m) : base(m) { }
    }

    public static class Assert
    {
        private static string Msg(string message, object[] args)
        {
            if (string.IsNullOrEmpty(message)) return "";
            if (args == null || args.Length == 0) return "  -- " + message;
            try { return "  -- " + string.Format(CultureInfo.InvariantCulture, message, args); }
            catch { return "  -- " + message; }
        }

        private static bool IsNumeric(object o) =>
            o is sbyte || o is byte || o is short || o is ushort || o is int ||
            o is uint || o is long || o is ulong || o is float || o is double || o is decimal;

        private static bool ValuesEqual(object a, object b)
        {
            if (ReferenceEquals(a, b)) return true;
            if (a == null || b == null) return false;
            if (IsNumeric(a) && IsNumeric(b))
            {
                // NUnit converts across numeric types; int 0 must equal long 0.
                double da = Convert.ToDouble(a, CultureInfo.InvariantCulture);
                double db = Convert.ToDouble(b, CultureInfo.InvariantCulture);
                return da.Equals(db);
            }
            return a.Equals(b);
        }

        private static string Show(object o)
        {
            if (o == null) return "null";
            if (o is double d) return d.ToString("R", CultureInfo.InvariantCulture);
            if (o is float f) return f.ToString("R", CultureInfo.InvariantCulture);
            return o.ToString();
        }

        public static void AreEqual(object expected, object actual, string message = null, params object[] args)
        {
            if (!ValuesEqual(expected, actual))
                throw new AssertionException(
                    $"Expected: {Show(expected)}\n  But was: {Show(actual)}{Msg(message, args)}");
        }

        public static void AreEqual(double expected, double actual, double delta, string message = null, params object[] args)
        {
            if (double.IsNaN(expected) || double.IsNaN(actual) || Math.Abs(expected - actual) > delta)
                throw new AssertionException(
                    $"Expected: {Show(expected)} +/- {delta}\n  But was: {Show(actual)}{Msg(message, args)}");
        }

        /// <summary>Reference identity, not value equality. The distinction is the
        /// whole point of the assertion -- a test that a function returned the very
        /// object it was given, rather than an equal copy.</summary>
        public static void AreSame(object expected, object actual, string message = null, params object[] args)
        {
            if (!ReferenceEquals(expected, actual))
                throw new AssertionException(
                    $"Expected the same instance: {Show(expected)}\n  But was a different one: {Show(actual)}{Msg(message, args)}");
        }

        public static void AreNotSame(object expected, object actual, string message = null, params object[] args)
        {
            if (ReferenceEquals(expected, actual))
                throw new AssertionException($"Expected a different instance{Msg(message, args)}");
        }

        public static void AreNotEqual(object expected, object actual, string message = null, params object[] args)
        {
            if (ValuesEqual(expected, actual))
                throw new AssertionException($"Expected not: {Show(expected)}{Msg(message, args)}");
        }

        public static void IsTrue(bool c, string message = null, params object[] args)
        {
            if (!c) throw new AssertionException("Expected: True\n  But was: False" + Msg(message, args));
        }

        public static void IsFalse(bool c, string message = null, params object[] args)
        {
            if (c) throw new AssertionException("Expected: False\n  But was: True" + Msg(message, args));
        }

        public static void IsNull(object o, string message = null, params object[] args)
        {
            if (o != null) throw new AssertionException($"Expected: null\n  But was: {Show(o)}{Msg(message, args)}");
        }

        public static void IsNotNull(object o, string message = null, params object[] args)
        {
            if (o == null) throw new AssertionException("Expected: not null\n  But was: null" + Msg(message, args));
        }

        private static int Cmp(object a, object b) =>
            Convert.ToDouble(a, CultureInfo.InvariantCulture)
                   .CompareTo(Convert.ToDouble(b, CultureInfo.InvariantCulture));

        public static void Greater(object a, object b, string message = null, params object[] args)
        {
            if (Cmp(a, b) <= 0) throw new AssertionException($"Expected: greater than {Show(b)}\n  But was: {Show(a)}{Msg(message, args)}");
        }

        public static void GreaterOrEqual(object a, object b, string message = null, params object[] args)
        {
            if (Cmp(a, b) < 0) throw new AssertionException($"Expected: >= {Show(b)}\n  But was: {Show(a)}{Msg(message, args)}");
        }

        public static void Less(object a, object b, string message = null, params object[] args)
        {
            if (Cmp(a, b) >= 0) throw new AssertionException($"Expected: less than {Show(b)}\n  But was: {Show(a)}{Msg(message, args)}");
        }

        public static void LessOrEqual(object a, object b, string message = null, params object[] args)
        {
            if (Cmp(a, b) > 0) throw new AssertionException($"Expected: <= {Show(b)}\n  But was: {Show(a)}{Msg(message, args)}");
        }

        public static void Fail(string message = null, params object[] args)
        {
            throw new AssertionException("Explicit failure" + Msg(message, args));
        }
    }

    public static class CollectionAssert
    {
        private static bool IsNumeric(object o) =>
            o is sbyte || o is byte || o is short || o is ushort || o is int ||
            o is uint || o is long || o is ulong || o is float || o is double || o is decimal;

        // A static helper rather than a local function: Mono's mcs, which the
        // parity harness uses, does not accept expression-bodied local functions.
        private static string Fmt(List<object> l) =>
            "[" + string.Join(", ", l.Select(x => x == null ? "null" : x.ToString())) + "]";

        public static void AreEqual(IEnumerable expected, IEnumerable actual, string message = null, params object[] args)
        {
            var e = expected.Cast<object>().ToList();
            var a = actual.Cast<object>().ToList();

            if (e.Count != a.Count)
                throw new AssertionException($"Expected {e.Count} items, got {a.Count}\n  expected {Fmt(e)}\n  actual   {Fmt(a)}");

            for (int i = 0; i < e.Count; i++)
            {
                // Numeric elements compare across types (long 1 == int 1), but
                // everything else must compare by value -- coercing strings
                // through Convert.ToDouble throws instead of failing cleanly.
                bool same = IsNumeric(e[i]) && IsNumeric(a[i])
                    ? Convert.ToDouble(e[i], CultureInfo.InvariantCulture)
                        .Equals(Convert.ToDouble(a[i], CultureInfo.InvariantCulture))
                    : Equals(e[i], a[i]);

                if (!same)
                    throw new AssertionException($"Differ at index {i}\n  expected {Fmt(e)}\n  actual   {Fmt(a)}");
            }
        }
    }
}

public static class ShimRunner
{
    public static int Main(string[] argv)
    {
        int pass = 0, fail = 0;
        var failures = new List<string>();

        var types = Assembly.GetExecutingAssembly().GetTypes()
            .Where(t => t.IsClass && !t.IsAbstract &&
                        t.GetMethods().Any(m => m.GetCustomAttribute<NUnit.Framework.TestAttribute>() != null))
            .OrderBy(t => t.Name);

        foreach (var type in types)
        {
            Console.WriteLine($"\n{type.Name}");
            var setUp = type.GetMethods()
                .FirstOrDefault(m => m.GetCustomAttribute<NUnit.Framework.SetUpAttribute>() != null);
            var tests = type.GetMethods()
                .Where(m => m.GetCustomAttribute<NUnit.Framework.TestAttribute>() != null)
                .OrderBy(m => m.Name);

            foreach (var test in tests)
            {
                object instance = Activator.CreateInstance(type);
                try
                {
                    setUp?.Invoke(instance, null);
                    test.Invoke(instance, null);
                    pass++;
                    Console.WriteLine($"  PASS  {test.Name}");
                }
                catch (TargetInvocationException tie)
                {
                    fail++;
                    Console.WriteLine($"  FAIL  {test.Name}");
                    string detail = tie.InnerException?.Message ?? tie.Message;
                    foreach (var line in detail.Split('\n')) Console.WriteLine("        " + line);
                    failures.Add($"{type.Name}.{test.Name}");
                }
            }
        }

        Console.WriteLine($"\n{pass}/{pass + fail} passed");
        if (failures.Count > 0)
        {
            Console.WriteLine("failed: " + string.Join(", ", failures));
            return 1;
        }
        return 0;
    }
}
