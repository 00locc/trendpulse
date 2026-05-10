/* patch.js — post-load fixes */

// Fix YouTube to use proper thumbnail renderer
(function() {
  window.loadYouTube = async function() {
    State._loaded['youtube'] = true;
    if (window._loadYouTubeFixed) {
      await window._loadYouTubeFixed();
    }
  };

  // Add saves loader
  window.loadSaves = async function() {
    State._loaded['saves'] = true;
    const el = document.getElementById('savesContainer');
    if (!el) return;
    if (!Auth.isLoggedIn()) {
      el.innerHTML = `<div class="loading-state full" style="flex-direction:column;gap:16px">
        <div style="font-size:48px">📌</div>
        <div style="font-size:16px;font-weight:600">Save anything from TrendPulse</div>
        <div style="font-size:13px;color:var(--text3);max-width:380px;text-align:center;line-height:1.6">Create a free account to bookmark niches, trending topics, questions and product ideas — all in one place.</div>
        <button class="btn-auth-primary" style="padding:12px 28px;font-size:14px" onclick="Auth.showAuthModal('register')">Create Free Account</button>
      </div>`;
      return;
    }
    await Auth.showSavesView();
  };

  // Override switchView to include saves
  const _origSwitchView = window.switchView;
  window.switchView = function(view) {
    _origSwitchView(view);
    if (view === 'saves' && !State._loaded['saves']) {
      loadSaves();
    }
  };

  // Add save button helper — call this to save anything
  window.saveItem = async function(btn, type, title, url, extra) {
    try {
      await Auth.addSave(type, title, url, extra || {});
      btn.classList.add('saved');
      btn.textContent = '★';
      btn.title = 'Saved!';
    } catch(e) {
      // Auth.addSave already shows modal if not logged in
    }
  };
})();
