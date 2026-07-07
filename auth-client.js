'use strict';

/* ══════════════════════════════════════════════════
   AUTH CLIENT — Sign Up / Log In (opsional)
   Token disimpan di localStorage. Tamu (tanpa akun)
   tetap bisa meeting seperti biasa.
   ══════════════════════════════════════════════════ */
const AUTH = {
  token: localStorage.getItem('authToken') || null,
  user:  null
};

// Dipakai webrtc-client.js saat menjadwalkan meeting
window.getAuthToken = () => AUTH.token;
window.getCurrentUser = () => AUTH.user;

const authDom = {
  loginBtn:   document.getElementById('auth-login-btn'),
  userBox:    document.getElementById('auth-user-box'),
  avatar:     document.getElementById('auth-avatar'),
  userName:   document.getElementById('auth-user-name'),
  logoutBtn:  document.getElementById('auth-logout-btn'),
  modal:      document.getElementById('auth-modal'),
  closeBtn:   document.getElementById('auth-modal-close'),
  tabLogin:   document.getElementById('auth-tab-login'),
  tabSignup:  document.getElementById('auth-tab-signup'),
  nameField:  document.getElementById('auth-name-field'),
  nameInput:  document.getElementById('auth-name'),
  emailInput: document.getElementById('auth-email'),
  pwInput:    document.getElementById('auth-password'),
  error:      document.getElementById('auth-error'),
  submit:     document.getElementById('auth-submit')
};

let authMode = 'login'; // 'login' | 'signup'

/* ── Pemanggilan API (sertakan header anti-warning ngrok) ── */
async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', ...(opts.headers || {}) };
  if (AUTH.token) headers['Authorization'] = `Bearer ${AUTH.token}`;
  const res  = await fetch(path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Gagal (${res.status})`);
  return data;
}

/* ── Modal ── */
function openAuthModal(mode = 'login') { setAuthMode(mode); authDom.modal.classList.remove('hidden'); }
function closeAuthModal() { authDom.modal.classList.add('hidden'); hideAuthError(); }

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === 'signup';
  authDom.tabLogin.classList.toggle('active', !isSignup);
  authDom.tabSignup.classList.toggle('active', isSignup);
  authDom.nameField.classList.toggle('hidden', !isSignup);
  authDom.submit.textContent = isSignup ? 'Daftar' : 'Masuk';
  hideAuthError();
}

function showAuthError(msg) { authDom.error.textContent = msg; authDom.error.classList.remove('hidden'); }
function hideAuthError() { authDom.error.classList.add('hidden'); }

/* ── Update tampilan sesuai status login ── */
function refreshAuthUI() {
  if (AUTH.user) {
    authDom.loginBtn.classList.add('hidden');
    authDom.userBox.classList.remove('hidden');
    authDom.avatar.textContent = (AUTH.user.name || '?').charAt(0).toUpperCase();
    authDom.userName.textContent = AUTH.user.name;
    // Prefill nama di form-form yang ada
    const u = document.getElementById('username-input');
    const h = document.getElementById('sf-host');
    if (u && !u.value) u.value = AUTH.user.name;
    if (h && !h.value) h.value = AUTH.user.name;
  } else {
    authDom.loginBtn.classList.remove('hidden');
    authDom.userBox.classList.add('hidden');
  }
}

/* ── Submit login / signup ── */
async function submitAuth() {
  hideAuthError();
  const email    = authDom.emailInput.value.trim();
  const password = authDom.pwInput.value;
  const name     = authDom.nameInput.value.trim();

  if (!email || !password)            return showAuthError('Email dan password wajib diisi.');
  if (authMode === 'signup' && !name) return showAuthError('Nama wajib diisi.');

  authDom.submit.disabled = true;
  authDom.submit.textContent = 'Memproses…';
  try {
    const path = authMode === 'signup' ? '/api/signup' : '/api/login';
    const body = authMode === 'signup' ? { name, email, password } : { email, password };
    const data = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });

    AUTH.token = data.token;
    AUTH.user  = data.user;
    localStorage.setItem('authToken', data.token);
    refreshAuthUI();
    closeAuthModal();
    authDom.pwInput.value = '';
    if (window.showToast) window.showToast(`Halo, ${data.user.name}!`, 'success');
  } catch (err) {
    showAuthError(err.message);
  } finally {
    authDom.submit.disabled = false;
    authDom.submit.textContent = authMode === 'signup' ? 'Daftar' : 'Masuk';
  }
}

async function doLogout() {
  try { await apiFetch('/api/logout', { method: 'POST' }); } catch {}
  AUTH.token = null;
  AUTH.user  = null;
  localStorage.removeItem('authToken');
  refreshAuthUI();
  if (window.showToast) window.showToast('Anda telah keluar', 'info');
}

/* ── Cek sesi saat halaman dibuka ── */
async function initAuth() {
  if (AUTH.token) {
    try {
      const data = await apiFetch('/api/me');
      AUTH.user = data.user;
    } catch {
      // token kedaluwarsa / tidak valid
      AUTH.token = null;
      localStorage.removeItem('authToken');
    }
  }
  refreshAuthUI();
}

/* ── Event listeners ── */
authDom.loginBtn.addEventListener('click', () => openAuthModal('login'));
authDom.logoutBtn.addEventListener('click', doLogout);
authDom.closeBtn.addEventListener('click', closeAuthModal);
authDom.modal.addEventListener('click', (e) => { if (e.target === authDom.modal) closeAuthModal(); });
authDom.tabLogin.addEventListener('click', () => setAuthMode('login'));
authDom.tabSignup.addEventListener('click', () => setAuthMode('signup'));
authDom.submit.addEventListener('click', submitAuth);
authDom.pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });

initAuth();
