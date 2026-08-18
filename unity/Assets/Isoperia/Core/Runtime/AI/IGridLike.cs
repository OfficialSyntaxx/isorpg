namespace Isoperia.Core.AI
{
    /// <summary>Minimal surface the pathfinder needs, so it can be tested against
    /// a fixture grid without constructing a whole world.</summary>
    public interface IGridLike
    {
        bool IsWalkable(int x, int y);
        int Width { get; }
        int Height { get; }
    }
}
