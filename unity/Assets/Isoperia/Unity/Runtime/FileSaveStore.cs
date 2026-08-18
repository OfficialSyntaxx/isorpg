using System;
using System.IO;
using System.Runtime.InteropServices;
using UnityEngine;
using Isoperia.Core.Save;

namespace Isoperia.Unity
{
    /// <summary>
    /// Disk-backed save store, with the WebGL IndexedDB flush wired in.
    ///
    /// The backup is not belt-and-braces: a save interrupted part-way through a
    /// write leaves a truncated primary that parses to nothing. Writing the
    /// backup only AFTER the primary has succeeded means the backup is always a
    /// complete, previously-good save, so <see cref="SaveSystem.Load"/> has
    /// something real to fall back to.
    /// </summary>
    public sealed class FileSaveStore : ISaveStore
    {
        private const string PrimaryFile = "isoperia.save.json";
        private const string BackupFile = "isoperia.backup.json";
        private const string TempSuffix = ".tmp";

        private readonly string _primaryPath;
        private readonly string _backupPath;

#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")]
        private static extern int IsoperiaSyncFs();
#endif

        public FileSaveStore()
        {
            _primaryPath = Path.Combine(Application.persistentDataPath, PrimaryFile);
            _backupPath = Path.Combine(Application.persistentDataPath, BackupFile);
        }

        public bool WritePrimary(string payload)
        {
            // Promote the previous good save to backup before overwriting it.
            try
            {
                if (File.Exists(_primaryPath)) File.Copy(_primaryPath, _backupPath, overwrite: true);
            }
            catch (Exception e)
            {
                // A failed backup rotation must not block the save itself.
                Debug.LogWarning("[Isoperia] could not rotate save backup: " + e.Message);
            }

            return WriteAtomic(_primaryPath, payload);
        }

        public string ReadPrimary() => ReadIfExists(_primaryPath);

        public bool WriteBackup(string payload) => WriteAtomic(_backupPath, payload);

        public string ReadLatestBackup() => ReadIfExists(_backupPath);

        /// <summary>
        /// Write via a temporary file and then move it into place.
        ///
        /// A direct write that is interrupted — quota exceeded, tab killed
        /// mid-write — leaves a half-written file that parses to nothing, and it
        /// has already destroyed the previous save. Writing elsewhere and moving
        /// means the destination only ever holds a complete document.
        ///
        /// On WebGL this is still worth doing: the move is within the in-memory
        /// filesystem, so a save is never partially visible to a later read.
        /// </summary>
        private static bool WriteAtomic(string path, string payload)
        {
            string tmp = path + TempSuffix;
            try
            {
                File.WriteAllText(tmp, payload);
                if (File.Exists(path)) File.Delete(path);
                File.Move(tmp, path);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError("[Isoperia] save write failed: " + e.Message);
                try { if (File.Exists(tmp)) File.Delete(tmp); } catch { /* best effort */ }
                return false;
            }
        }

        private static string ReadIfExists(string path)
        {
            try
            {
                return File.Exists(path) ? File.ReadAllText(path) : null;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Isoperia] save read failed: " + e.Message);
                return null;
            }
        }

        /// <summary>
        /// On WebGL, push the in-memory filesystem to IndexedDB. Everywhere else
        /// the write already reached the disk and this is a no-op.
        ///
        /// Without this on WebGL, every save is lost when the tab closes.
        /// </summary>
        public bool Flush()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            try
            {
                return IsoperiaSyncFs() != 0;
            }
            catch (Exception e)
            {
                Debug.LogError("[Isoperia] IndexedDB flush failed: " + e.Message);
                return false;
            }
#else
            return true;
#endif
        }
    }
}
