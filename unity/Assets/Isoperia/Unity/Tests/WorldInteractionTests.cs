using Isoperia.Core.Components;
using Isoperia.Core.Save;
using NUnit.Framework;
using UnityEngine;

namespace Isoperia.Unity.Tests
{
    public sealed class WorldInteractionTests
    {
        [Test]
        public void DistantNpcCannotStartConversationOrAcceptJourney()
        {
            var root = new GameObject("TestNpc");
            int started = 0;
            System.Action<WorldInteractionTarget> listener = _ => started++;
            WorldInteractionTarget.InteractionStarted += listener;
            try
            {
                root.transform.position = new Vector3(30, 0, 30);
                var target = root.AddComponent<WorldInteractionTarget>();
                target.SetNpc("Wayfinder", "Welcome");
                target.SetJourney("test-journey");
                Assert.IsFalse(target.TryInteract(new PositionComponent { Gx = 1, Gy = 1 }));
                Assert.AreEqual(0, started);
            }
            finally
            {
                WorldInteractionTarget.InteractionStarted -= listener;
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void MissingGatheringOwnerDoesNotEmitSuccessfulInteraction()
        {
            Assert.IsNull(SaveDriver.Instance, "Run this EditMode test outside Play Mode.");
            var root = new GameObject("TestResource");
            int started = 0;
            System.Action<WorldInteractionTarget> listener = _ => started++;
            WorldInteractionTarget.InteractionStarted += listener;
            try
            {
                var target = root.AddComponent<WorldInteractionTarget>();
                target.SetResource(new WorldResourceNode("TREE", 1, 1, JsonValue.Parse("{\"depletes\":true,\"maxUses\":5}")));
                Assert.IsFalse(target.TryInteract(new PositionComponent { Gx = 1, Gy = 1 }));
                Assert.AreEqual(0, started);
            }
            finally
            {
                WorldInteractionTarget.InteractionStarted -= listener;
                Object.DestroyImmediate(root);
            }
        }

        [Test]
        public void ScaledImportedModelIsGroundedWithoutScalingParentHitbox()
        {
            var root = new GameObject("ResourceRoot");
            try
            {
                root.transform.position = new Vector3(12, 3, 24);
                var model = GameObject.CreatePrimitive(PrimitiveType.Cube);
                model.transform.SetParent(root.transform, false);
                model.transform.localScale = Vector3.one * 100;
                OwnedModelPresentation.FitToHeight(model, 4.35f, 3f);
                var collider = root.AddComponent<CapsuleCollider>();
                collider.radius = .42f;
                Assert.AreEqual(4.35f, model.GetComponent<Renderer>().bounds.size.y, .001f);
                Assert.AreEqual(3f, model.GetComponent<Renderer>().bounds.min.y, .001f);
                Assert.AreEqual(Vector3.one, root.transform.lossyScale);
                Assert.AreEqual(.42f, collider.radius);
            }
            finally { Object.DestroyImmediate(root); }
        }
    }
}
