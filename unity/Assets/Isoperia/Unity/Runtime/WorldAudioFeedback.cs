using System.Collections.Generic;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Small cached SFX bridge for successful world interactions. Browser audio
    /// unlocking is owned by the WebGL template; game rules never depend on a clip.
    /// </summary>
    [RequireComponent(typeof(AudioSource))]
    public sealed class WorldAudioFeedback : MonoBehaviour
    {
        private const string AudioRoot = "Audio/";
        private readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        private AudioSource source;
        private SaveDriver saveDriver;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (M0InspectionStartup.IsInspectionScene()) return;
            if (Object.FindAnyObjectByType<WorldAudioFeedback>() != null) return;
            new GameObject(nameof(WorldAudioFeedback)).AddComponent<WorldAudioFeedback>();
        }

        private void Awake()
        {
            source = GetComponent<AudioSource>();
            source.playOnAwake = false;
            source.spatialBlend = 0f;
            source.volume = .55f;
            Load("chop");
            Load("mine");
            Load("fish");
            Load("hit");
            Load("accept_quest");
            Load("quest_complete");
            Load("ui_click");
        }

        private void OnEnable()
        {
            WorldInteractionTarget.InteractionStarted += PlayFor;
        }

        private void Start()
        {
            saveDriver = SaveDriver.Instance;
            if (saveDriver != null) saveDriver.TaskCompleted += PlayQuestComplete;
        }

        private void OnDisable()
        {
            WorldInteractionTarget.InteractionStarted -= PlayFor;
            if (saveDriver != null) saveDriver.TaskCompleted -= PlayQuestComplete;
        }

        private void PlayFor(WorldInteractionTarget target)
        {
            if (target == null) return;
            if (target.IsJourney) { Play("accept_quest"); return; }
            if (target.IsEnemy) { Play("hit"); return; }
            if (target.IsNpc) { Play("ui_click"); return; }
            if (target.ResourceType == "ROCK") { Play("mine"); return; }
            if (target.ResourceType == "FISH") { Play("fish"); return; }
            Play("chop");
        }

        private void PlayQuestComplete()
        {
            Play("quest_complete");
        }

        private void Load(string id)
        {
            AudioClip clip = Resources.Load<AudioClip>(AudioRoot + id);
            if (clip != null) clips[id] = clip;
        }

        private void Play(string id)
        {
            if (source != null && clips.TryGetValue(id, out AudioClip clip)) source.PlayOneShot(clip);
        }
    }
}
