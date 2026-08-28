/* Applies the viewer's saved theme choice before first paint.
 *
 * WHY THIS IS AN EXTERNAL BLOCKING SCRIPT RATHER THAN INLINE
 * It has to run before the browser paints, or someone who chose dark sees a
 * flash of the light palette on every navigation. The usual fix is an inline
 * <script> in <head>, but blueprint §8.1 bans 'unsafe-inline' in script-src,
 * and hash-pinning a script means the hash has to be regenerated whenever the
 * script changes — a footgun that eventually ships a blocked script and a
 * flashing page. A tiny same-origin blocking script needs only 'self'.
 *
 * Every storage access is wrapped: localStorage throws outright in some
 * contexts (blocked site data, some private modes, thumbnail capture), and an
 * exception here would abort before the theme is applied.
 */
(function () {
  /* Marks the document as scripted, before first paint.
   *
   * WHY THIS LINE EXISTS
   * The scroll-reveal primitive hides [data-reveal] elements and relies on a
   * module script to un-hide them. With JavaScript disabled that script never
   * runs, so the elements stayed hidden — and the landing page shipped a
   * COMPLETELY BLANK hero: no headline, no lede, no buttons, just a gradient.
   * Captured in a real browser with scripting off; it was live.
   *
   * The comment above that CSS asserted the opposite ("content is visible if
   * the observer never runs"), which is why it survived review. The claim was
   * true of an earlier draft and became false without anyone touching the
   * sentence.
   *
   * So the offset state is now opt-in on THIS flag rather than unconditional:
   * a page that cannot animate never hides anything in the first place. It has
   * to be set before paint, which is why it belongs in this file rather than in
   * the motion module — by the time a module runs, the hidden frame has already
   * been painted.
   */
  document.documentElement.setAttribute("data-js", "");

  /* A3: the time of day, decided before first paint.
   *
   * This lived in the hero's own module and ran after load, which changed the
   * sun's top/right/width/height once the page was already painted. Those are
   * LAYOUT properties, so a 429x429 element moving counted as a layout shift:
   * Lighthouse attributed 0.29 of a 0.295 CLS to span.hero__sun alone, and it
   * cost the landing page 17 points of mobile performance.
   *
   * Deciding it here costs one Date call in a script that already blocks, and
   * the hero is simply correct on the first frame — there is nothing to shift.
   *
   * The boundaries are uneven because light is: a narrow dawn, a long flat day,
   * a short intense dusk, and a long night where the settlement's windows are
   * the brightest thing on screen. Local time, so midnight anywhere looks like
   * midnight.
   */
  var hour = new Date().getHours();
  document.documentElement.setAttribute(
    "data-daypart",
    hour >= 5 && hour < 8
      ? "dawn"
      : hour >= 8 && hour < 17
        ? "day"
        : hour >= 17 && hour < 20
          ? "dusk"
          : "night",
  );

  try {
    var saved = window.localStorage.getItem("isoperia-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
    // No saved value means "follow the OS", which is what tokens.css already
    // does via prefers-color-scheme. Setting nothing is the correct action.
  } catch {
    /* Storage unavailable — fall through to the OS preference. */
  }
})();
