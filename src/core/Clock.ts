// P3: pure day/night clock helpers (no DOM/THREE — easily unit-tested).
// One game tick (600ms) advances one in-game minute.

export const MINUTES_PER_DAY = 1440;

/** Advance the clock by `ticks` minutes, rolling the day counter on wrap. */
export function tickClock(minute: number, day: number, ticks: number): { minute: number; day: number } {
  let m = minute + ticks;
  let d = day;
  while (m >= MINUTES_PER_DAY) {
    m -= MINUTES_PER_DAY;
    d++;
  }
  return { minute: m, day: d };
}

/** Daylight factor 0..1 (1 ≈ noon). Linear ramp dawn→noon→dusk, 0 at night. */
export function dayFactor(hour: number): number {
  if (hour < 6.5 || hour > 19.5) return 0;
  const d = hour <= 12.5 ? (hour - 6.5) / 6 : (19.5 - hour) / 6;
  return Math.max(0, Math.min(1, d));
}

export type DayPhase = "night" | "dawn" | "day" | "dusk";

export function phaseFor(hour: number): DayPhase {
  if (hour >= 7 && hour < 18) return "day";
  if (hour >= 19 || hour < 5) return "night";
  return hour < 12 ? "dawn" : "dusk";
}

export function iconFor(hour: number): string {
  switch (phaseFor(hour)) {
    case "day": return "☀️";
    case "dusk": return "🌇";
    case "dawn": return "🌅";
    default: return "🌙";
  }
}
