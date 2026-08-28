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
