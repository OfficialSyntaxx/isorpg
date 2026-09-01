using System.Collections.Generic;
using Isoperia.Core.Content;
using NUnit.Framework;

namespace Isoperia.Unity.Tests
{
    public sealed class WorldResourceSelectionTests
    {
        private static WorldResourceNode Node(string type, int x, int y)
        {
            return new WorldResourceNode(type, x, y, JsonValue.Parse("{\"depletes\":true,\"maxUses\":5}"));
        }

        [Test]
        public void SelectsNearestResourcesAndCapsEachKindIndependently()
        {
            var nodes = new List<WorldResourceNode>();
            for (int y = 8; y >= 1; y--)
            for (int x = 8; x >= 1; x--)
            {
                nodes.Add(Node("TREE", x, y));
                nodes.Add(Node("ROCK", -x, y));
                nodes.Add(Node("WATER", x, -y));
            }
            var result = new List<WorldResourceNode>();
            WorldResourceSelection.Select(nodes, 0, 0, result);
            Assert.AreEqual(64, result.Count);
            Assert.AreEqual(32, result.FindAll(n => n.Type == "TREE").Count);
            Assert.AreEqual(24, result.FindAll(n => n.Type == "ROCK").Count);
            Assert.AreEqual(8, result.FindAll(n => n.Type == "WATER").Count);
            Assert.IsTrue(result.Exists(n => n.Id == "TREE_1_1"));
            Assert.IsFalse(result.Exists(n => n.Id == "TREE_8_8"));
            int previous = -1;
            foreach (WorldResourceNode node in result)
            {
                int distance = node.X * node.X + node.Y * node.Y;
                Assert.IsTrue(distance >= previous);
                previous = distance;
            }
        }

        [Test]
        public void DepletedOutsideRadiusAndUnknownTypesAreNotPresented()
        {
            var depleted = Node("TREE", 0, 0); depleted.Depleted = true;
            var edge = Node("TREE", 28, 0);
            var nodes = new List<WorldResourceNode> { depleted, edge, Node("ROCK", 29, 0), Node("DEBUG", 0, 0) };
            var result = new List<WorldResourceNode>();
            WorldResourceSelection.Select(nodes, 0, 0, result);
            Assert.AreEqual(1, result.Count);
            Assert.AreEqual(edge, result[0]);
            depleted.Depleted = false;
            WorldResourceSelection.Select(nodes, 0, 0, result);
            Assert.AreEqual(2, result.Count);
            Assert.AreEqual(depleted, result[0]);
        }

        [Test]
        public void TeleportReplacesSelectionAndTiesStayDeterministic()
        {
            var nodes = new List<WorldResourceNode> { Node("TREE", 1, 0), Node("TREE", 0, 1), Node("ROCK", 100, 100) };
            var result = new List<WorldResourceNode>();
            WorldResourceSelection.Select(nodes, 0, 0, result);
            string first = result[0].Id;
            nodes.Reverse();
            WorldResourceSelection.Select(nodes, 0, 0, result);
            Assert.AreEqual(first, result[0].Id);
            WorldResourceSelection.Select(nodes, 100, 100, result);
            Assert.AreEqual(1, result.Count);
            Assert.AreEqual("ROCK_100_100", result[0].Id);
        }
    }
}
