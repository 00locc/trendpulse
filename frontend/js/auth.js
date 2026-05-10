/* ============================================
   auth.js — TrendPulse Login System
   Handles: register, login, logout, saves
   ============================================ */

const Auth = (() => {

  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api';

  let currentUser = null;
  let authToken   = localStorage.getItem('tp_token') || null;
  let pendingSave = null;

  // ── INIT ──────────────────────────────────────────────────
  async function init() {
    if (authToken) {
      try {
        const res  = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${authToken}` } });
        const data = await res.json();
        if (data.user) {
          currentUser = data.user;
          updateNav(true);
          return;
        }
      } catch(e) {}
      // Token invalid — clear it
      authToken = null;
      localStorage.removeItem('tp_token');
    }
    updateNav(false);
  }

  // ── AUTH CALLS ────────────────────────────────────────────
  async function register(email, password, name) {
    const res  = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('tp_token', authToken);
    updateNav(true);
    return data;
  }

  async function login(email, password) {
    const res  = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('tp_token', authToken);
    updateNav(true);
    return data;
  }

  function logout() {
    authToken   = null;
    currentUser = null;
    localStorage.removeItem('tp_token');
    updateNav(false);
    showToast('Logged out successfully');
  }

  function getUser()  { return currentUser; }
  function getToken() { return authToken; }
  function isLoggedIn() { return !!currentUser; }

  // ── SAVES ─────────────────────────────────────────────────
  async function getSaves() {
    if (!authToken) return [];
    const res  = await fetch(`${API_BASE}/saves`, { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await res.json();
    return data.saves || [];
  }

  async function addSave(type, title, url, extra = {}, notes = '') {
    if (!authToken) { showAuthModal('login'); throw new Error('Not logged in'); }
    const res  = await fetch(`${API_BASE}/saves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ type, title, url, data: extra, notes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Save failed');
    showToast(`✓ Saved "${title.substring(0, 40)}"`);
    return data.save;
  }

  async function deleteSave(saveId) {
    if (!authToken) return;
    await fetch(`${API_BASE}/saves/${saveId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    showToast('Removed from saves');
  }

  // ── NAV UPDATE ─────────────────────────────────────────────
  function updateNav(loggedIn) {
    const authBtns  = document.getElementById('authButtons');
    const userMenu  = document.getElementById('userMenu');
    const userName  = document.getElementById('userName');
    const savesBadge = document.getElementById('savesBadge');

    if (authBtns)  authBtns.style.display  = loggedIn ? 'none'  : 'flex';
    if (userMenu)  userMenu.style.display   = loggedIn ? 'flex'  : 'none';
    if (userName && currentUser) userName.textContent = currentUser.name || currentUser.email.split('@')[0];

    // Update save button states
    if (loggedIn) loadSaveStates();
  }

  async function loadSaveStates() {
    try {
      const saves = await getSaves();
      const savedTitles = new Set(saves.map(s => s.title.toLowerCase()));
      document.querySelectorAll('.bookmark-btn').forEach(btn => {
        const title = btn.dataset.title?.toLowerCase();
        if (title && savedTitles.has(title)) {
          btn.classList.add('saved');
          btn.title = 'Saved';
          btn.setAttribute('aria-label', `Saved ${btn.dataset.title || 'item'}`);
        }
      });
    } catch(e) {}
  }

  async function processPendingSave() {
    if (!pendingSave || !authToken) return;
    const item = pendingSave;
    pendingSave = null;
    try {
      await addSave(item.type, item.title, item.url, item.extra, item.notes);
      loadSaveStates();
    } catch(e) {}
  }

  function saveButton({ type = 'topic', title = '', url = '', extra = {}, notes = '' }) {
    const payload = encodeURIComponent(JSON.stringify({ type, title, url, extra, notes }));
    return `<button class="bookmark-btn" data-title="${escHtml(title)}" data-save="${payload}" onclick="event.stopPropagation();Auth.handleSaveButton(this)" title="Save to My Saves" aria-label="Save ${escHtml(title)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="bookmark-shape" d="M7 4.5h10v15l-5-3.1-5 3.1z"/></svg></button>`;
  }

  async function handleSaveButton(btn) {
    let item;
    try {
      item = JSON.parse(decodeURIComponent(btn.dataset.save || '%7B%7D'));
    } catch(e) {
      showToast('Could not read this item');
      return;
    }
    if (!isLoggedIn()) {
      pendingSave = item;
      showAuthModal('login');
      showToast('Log in to save this');
      return;
    }
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('saving');
    try {
      await addSave(item.type, item.title, item.url, item.extra, item.notes);
      btn.classList.add('saved');
      btn.classList.remove('saving');
      btn.disabled = false;
      btn.title = 'Saved';
      btn.setAttribute('aria-label', `Saved ${btn.dataset.title || 'item'}`);
    } catch(e) {
      btn.disabled = false;
      btn.innerHTML = original;
      btn.classList.remove('saving');
      showToast(e.message || 'Save failed');
    }
  }

  // ── MODAL ─────────────────────────────────────────────────
  function showAuthModal(mode = 'login') {
    const modal = document.getElementById('authModal');
    if (!modal) return;
    modal.classList.add('open');
    switchAuthMode(mode);
  }

  function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('open');
    clearAuthError();
  }

  function switchAuthMode(mode) {
    const loginForm    = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const modalTitle   = document.getElementById('authModalTitle');
    const switchText   = document.getElementById('authSwitchText');

    if (mode === 'login') {
      if (loginForm)    loginForm.style.display    = 'flex';
      if (registerForm) registerForm.style.display = 'none';
      if (modalTitle)   modalTitle.textContent = 'Welcome back';
      if (switchText)   switchText.innerHTML = "Don't have an account? <a href='#' onclick='Auth.switchAuthMode(\"register\");return false'>Sign up free</a>";
    } else {
      if (loginForm)    loginForm.style.display    = 'none';
      if (registerForm) registerForm.style.display = 'flex';
      if (modalTitle)   modalTitle.textContent = 'Create your account';
      if (switchText)   switchText.innerHTML = "Already have an account? <a href='#' onclick='Auth.switchAuthMode(\"login\");return false'>Log in</a>";
    }
    clearAuthError();
  }

  function setAuthError(msg) {
    const el = document.getElementById('authError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function clearAuthError() {
    const el = document.getElementById('authError');
    if (el) { el.textContent = ''; el.style.display = 'none'; }
  }

  function setAuthLoading(loading) {
    document.querySelectorAll('.auth-submit').forEach(btn => {
      btn.disabled    = loading;
      btn.textContent = loading ? 'Please wait...' : btn.dataset.label;
    });
  }

  // ── FORM HANDLERS ─────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    clearAuthError();
    setAuthLoading(true);
    try {
      await login(email, password);
      hideAuthModal();
      await processPendingSave();
      showToast(`Welcome back! 👋`);
    } catch(err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    const name     = document.getElementById('registerName').value.trim();
    const email    = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    clearAuthError();
    setAuthLoading(true);
    try {
      await register(email, password, name);
      hideAuthModal();
      await processPendingSave();
      showToast(`Account created! Welcome to TrendPulse 🎉`);
    } catch(err) {
      setAuthError(err.message);
    }
    setAuthLoading(false);
  }

  // ── SAVES VIEW ────────────────────────────────────────────
  async function showSavesView() {
    if (!isLoggedIn()) { showAuthModal('login'); return; }
    const el = document.getElementById('savesContainer');
    if (!el) return;
    el.innerHTML = '<div class="loading-state full">Loading your saves...</div>';

    try {
      const saves = await getSaves();
      if (!saves.length) {
        el.innerHTML = `<div class="loading-state full">
          <div style="font-size:32px;margin-bottom:12px">📌</div>
          <div>No saves yet</div>
          <div style="font-size:12px;color:var(--text3);margin-top:6px">Click the ☆ button on any trend, niche or question to save it here</div>
        </div>`;
        return;
      }

      const byType = {};
      saves.forEach(s => { if (!byType[s.type]) byType[s.type] = []; byType[s.type].push(s); });

      const typeLabels = { niche:'📚 Saved Niches', topic:'🔥 Saved Topics', question:'❓ Saved Questions', product:'🛒 Saved Products', custom:'📌 Saved Items' };

      el.innerHTML = Object.entries(byType).map(([type, items]) => `
        <div class="section-header">${typeLabels[type] || '📌 ' + type}</div>
        <div class="saves-grid">${items.map(s => `
          <div class="save-item" data-id="${s.id}">
            <div class="save-item-top">
              <div class="save-title">${escHtml(s.title)}</div>
              <button class="save-delete-btn" onclick="Auth.deleteSaveItem(${s.id}, this)" title="Remove">✕</button>
            </div>
            ${s.notes ? `<div class="save-notes">${escHtml(s.notes)}</div>` : ''}
            <div class="save-meta">${new Date(s.created_at).toLocaleDateString()}</div>
            ${s.url ? `<a href="${escHtml(s.url)}" target="_blank" class="save-link">Open ↗</a>` : ''}
          </div>
        `).join('')}</div>
      `).join('');
    } catch(e) {
      el.innerHTML = '<div class="loading-state full">Error loading saves</div>';
    }
  }

  async function deleteSaveItem(saveId, btn) {
    try {
      await deleteSave(saveId);
      const item = btn.closest('.save-item');
      if (item) item.remove();
    } catch(e) {}
  }

  // ── TOAST ─────────────────────────────────────────────────
  function showToast(msg) {
    let toast = document.getElementById('tp-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'tp-toast';
      toast.style.cssText = `
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(100px);
        background:var(--bg2); border:1px solid var(--border); border-radius:10px;
        padding:12px 24px; font-size:13px; font-weight:600; color:var(--text);
        z-index:9999; transition:transform .3s ease; white-space:nowrap;
        box-shadow:0 8px 32px rgba(0,0,0,0.4);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(100px)'; }, 3000);
  }

  function escHtml(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    init, login, register, logout,
    getUser, getToken, isLoggedIn,
    getSaves, addSave, deleteSave, deleteSaveItem,
    saveButton, handleSaveButton,
    showAuthModal, hideAuthModal, switchAuthMode,
    handleLogin, handleRegister,
    showSavesView, showToast, loadSaveStates,
  };

})();

// Init on load
document.addEventListener('DOMContentLoaded', () => Auth.init());



