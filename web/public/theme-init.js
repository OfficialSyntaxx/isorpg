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
