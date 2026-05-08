/* patch.js — fixes loadYouTube to use proper thumbnail rendering */
/* Loaded after app.js, overrides the broken YouTube renderer */

(function() {
  // Store original switchView
  var _origSwitchView = window.switchView;
  
  // Override loadYouTube when the youtube view is accessed
  window.loadYouTube = async function() {
    State._loaded['youtube'] = true;
    await window._loadYouTubeFixed();
  };
})();
