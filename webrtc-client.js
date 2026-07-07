'use strict';

/* ══════════════════════════════════════════════════
   KONFIGURASI
   ══════════════════════════════════════════════════ */
/* ── TURN (Metered.ca) — kredensial di SATU tempat ──────
   Daftar gratis (50 GB/bulan) di https://dashboard.metered.ca
   lalu salin "username" & "credential" dari dashboard ke sini.
   Selama belum diisi, koneksi masih jalan via STUN saja
   (cukup untuk jaringan rumah biasa, tapi bisa gagal di NAT ketat). */
const TURN_CREDENTIALS = {
  username:   'ff4486e207da9d6ace79492c',
  credential: 'LX682GAfTw7ukM3L'
};

/* Toggle pengujian:
   true  → PAKSA seluruh trafik lewat TURN relay (untuk uji skenario internet publik).
   false → koneksi normal: P2P langsung bila bisa, TURN dipakai otomatis bila perlu. */
const FORCE_TURN_RELAY = false;

const CONFIG = {
  // Socket.IO otomatis menyambung ke origin halaman (URL ngrok) — tidak ada host hardcoded.
  ICE_SERVERS: [
    { urls: 'stun:stun.l.google.com:19302'  },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:global.relay.metered.ca:80',
        'turn:global.relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:443',
        'turns:global.relay.metered.ca:443?transport=tcp'
      ],
      username:   TURN_CREDENTIALS.username,
      credential: TURN_CREDENTIALS.credential
    }
  ],
  ICE_TRANSPORT_POLICY: FORCE_TURN_RELAY ? 'relay' : 'all',
  MEDIA_CONSTRAINTS: {
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
    audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 }
  },
  STATS_INTERVAL_MS: 1000
};

/* ══════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════ */
const state = {
  socket:        null,
  localStream:   null,
  peers:         {},
  roomId:        '',
  username:      '',
  callStartAt:   null,
  timerInterval: null,
  statsInterval: null,
  statsLog:      [],
  audioEnabled:  true,
  videoEnabled:  true,
  inCall:        false,
  pendingJoin:   false,
  chatUnread:    0
};

/* ══════════════════════════════════════════════════
   DOM
   ══════════════════════════════════════════════════ */
const dom = {
  // Join screen
  joinScreen:         document.getElementById('join-screen'),
  callScreen:         document.getElementById('call-screen'),
  roomIdInput:        document.getElementById('room-id-input'),
  usernameInput:      document.getElementById('username-input'),
  createRoomBtn:      document.getElementById('create-room-btn'),
  joinTextBtn:        document.getElementById('join-text-btn'),
  joinError:          document.getElementById('join-error'),
  // New meeting dropdown
  nmMenu:             document.getElementById('nm-menu'),
  nmBtnInstant:       document.getElementById('nm-btn-instant'),
  nmBtnScheduled:     document.getElementById('nm-btn-scheduled'),
  homeContentDivider: document.getElementById('home-content-divider'),
  meetingsSection:    document.getElementById('meetings-section'),
  // Room link card
  roomLinkCard:       document.getElementById('room-link-card'),
  rlcCodeDisplay:     document.getElementById('rlc-code-display'),
  rlcLinkInput:       document.getElementById('rlc-link-input'),
  copyLinkBtn:        document.getElementById('btn-copy-link'),
  // Call screen
  headerRoomName:     document.getElementById('header-room-name'),
  connectionBadge:    document.getElementById('connection-badge'),
  connectionLabel:    document.getElementById('connection-label'),
  callTimer:          document.getElementById('call-timer'),
  videoGrid:          document.getElementById('video-grid'),
  localVideo:         document.getElementById('local-video'),
  localUsernameLabel: document.getElementById('local-username-label'),
  localCamOff:        document.getElementById('local-cam-off'),
  localMutedOverlay:  document.getElementById('local-muted-overlay'),
  localCamOffMute:    document.getElementById('local-camoff-mute'),
  remoteTiles:        document.getElementById('remote-tiles-container'),
  waitingTile:        document.getElementById('waiting-tile'),
  statsPanel:         document.getElementById('stats-panel'),
  statsCloseBtn:      document.getElementById('stats-close-btn'),
  statRTT:            document.getElementById('stat-rtt'),
  statLoss:           document.getElementById('stat-loss'),
  statJitter:         document.getElementById('stat-jitter'),
  statThroughput:     document.getElementById('stat-throughput'),
  statFPS:            document.getElementById('stat-fps'),
  statRes:            document.getElementById('stat-res'),
  statsLog:           document.getElementById('stats-log'),
  exportLogBtn:       document.getElementById('export-log-btn'),
  btnAudio:           document.getElementById('btn-toggle-audio'),
  btnVideo:           document.getElementById('btn-toggle-video'),
  btnStats:           document.getElementById('btn-toggle-stats'),
  btnHangup:          document.getElementById('btn-hangup'),
  // Meetings
  scheduleToggleBtn:  document.getElementById('btn-toggle-schedule'),
  scheduleForm:       document.getElementById('schedule-form'),
  sfTitle:            document.getElementById('sf-title'),
  sfHost:             document.getElementById('sf-host'),
  sfDatetime:         document.getElementById('sf-datetime'),
  cancelScheduleBtn:  document.getElementById('btn-cancel-schedule'),
  submitScheduleBtn:  document.getElementById('btn-submit-schedule'),
  meetingsList:       document.getElementById('meetings-list'),
  // Toast
  toastContainer:     document.getElementById('toast-container'),
  // Preview / lobby
  previewScreen:      document.getElementById('preview-screen'),
  previewVideo:       document.getElementById('preview-video'),
  previewCamOff:      document.getElementById('preview-cam-off'),
  previewToggleAudio: document.getElementById('preview-toggle-audio'),
  previewToggleVideo: document.getElementById('preview-toggle-video'),
  previewRoomCode:    document.getElementById('preview-room-code'),
  previewNameInput:   document.getElementById('preview-name-input'),
  previewJoinBtn:     document.getElementById('preview-join-btn'),
  previewBackBtn:     document.getElementById('preview-back-btn'),
  // Chat
  btnChat:            document.getElementById('btn-toggle-chat'),
  chatBadge:          document.getElementById('chat-badge'),
  chatPanel:          document.getElementById('chat-panel'),
  chatCloseBtn:       document.getElementById('chat-close-btn'),
  chatMessages:       document.getElementById('chat-messages'),
  chatInput:          document.getElementById('chat-input'),
  chatSendBtn:        document.getElementById('chat-send-btn')
};

/* ══════════════════════════════════════════════════
   UTILITY
   ══════════════════════════════════════════════════ */
function log(msg, ...args) { console.log(`[WebRTC] ${msg}`, ...args); }

function padTwo(n) { return String(n).padStart(2, '0'); }

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${padTwo(h)}:${padTwo(m)}:${padTwo(s)}`
    : `${padTwo(m)}:${padTwo(s)}`;
}

function showJoinError(msg) {
  dom.joinError.textContent = msg;
  dom.joinError.classList.remove('hidden');
}
function hideJoinError() { dom.joinError.classList.add('hidden'); }

function setBadge(status) {
  dom.connectionBadge.className = `badge badge--${status}`;
  const labels = { connecting: 'Menghubungkan…', connected: 'Terhubung', failed: 'Gagal' };
  dom.connectionLabel.textContent = labels[status] || status;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = msg;
  dom.toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  setTimeout(() => {
    el.classList.remove('toast--visible');
    setTimeout(() => el.remove(), 300);
  }, 3200);
}
window.showToast = showToast;  // dipakai juga oleh auth-client.js

/* ══════════════════════════════════════════════════
   SOCKET — inisialisasi dan listener
   ══════════════════════════════════════════════════ */
function getSocket() {
  if (!state.socket) {
    log('Menginisialisasi socket ke origin halaman (otomatis mengikuti URL ngrok)');
    state.socket = io();  // tanpa argumen → menyambung ke origin tempat halaman dilayani
    attachSocketListeners();
  }
  return state.socket;
}

function withSocket(cb) {
  const socket = getSocket();
  if (socket.connected) { cb(socket); }
  else { socket.once('connect', () => cb(socket)); }
}

function attachSocketListeners() {
  const socket = state.socket;

  socket.on('connect', () => {
    log('Socket terhubung:', socket.id);
    socket.emit('get-meetings');
    if (state.pendingJoin) {
      state.pendingJoin = false;
      socket.emit('join-room',   { roomId: state.roomId, username: state.username });
      socket.emit('video-state', { roomId: state.roomId, enabled: state.videoEnabled });
    }
  });

  socket.on('connect_error', (err) => {
    log('Socket error:', err.message);
    if (state.inCall) setBadge('failed');
  });

  /* ── Pre-call events ── */
  socket.on('room-created', ({ roomId }) => {
    log('Room dibuat:', roomId);
    dom.roomIdInput.value = roomId;
    showRoomLinkCard(roomId);
    dom.nmBtnInstant.disabled = false;
    dom.nmBtnInstant.querySelector('.nm-item-title').textContent = 'Mulai sekarang';
    showToast('Room berhasil dibuat!', 'success');
  });

  socket.on('meetings-list', ({ meetings }) => {
    renderMeetings(meetings);
  });

  socket.on('meeting-scheduled', () => {
    socket.emit('get-meetings');
    hideScheduleForm();
    showToast('Meeting dijadwalkan', 'success');
  });

  socket.on('meeting-deleted', () => {
    socket.emit('get-meetings');
    showToast('Meeting dihapus', 'info');
  });

  /* ── In-call events ── */
  socket.on('ready', ({ roomId }) => {
    log('Room ready (≥ 2 peer):', roomId);
  });

  socket.on('room-peers', async ({ peers }) => {
    log('Peers di room:', peers);
    for (const peer of peers) {
      await createPeerConnection(peer.socketId, peer.username, true);
    }
  });

  socket.on('peer-joined', async ({ socketId, username }) => {
    log(`Peer baru bergabung: ${username} (${socketId})`);
    showToast(`${username} bergabung`, 'info');
    // isInitiator=false: peer baru yang masuk (via room-peers) yang kirim offer,
    // peer lama cukup siapkan koneksi dan tunggu offer dari peer baru.
    await createPeerConnection(socketId, username, false);
    // Jika kamera kita sedang mati, beri tahu peer baru agar tampil overlay
    if (!state.videoEnabled) {
      state.socket.emit('video-state', { roomId: state.roomId, enabled: false });
    }
  });

  socket.on('offer', async ({ from, sdp }) => {
    log('Menerima offer dari', from);
    if (!state.peers[from]) await createPeerConnection(from, '…', false);
    const peer = state.peers[from];
    const pc = peer.pc;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await flushPendingCandidates(peer);   // remote description siap → proses candidate yang tertunda
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { to: from, sdp: pc.localDescription });
    log('Mengirim answer ke', from);
  });

  socket.on('answer', async ({ from, sdp }) => {
    log('Menerima answer dari', from);
    const peer = state.peers[from];
    if (peer) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flushPendingCandidates(peer); // remote description siap → proses candidate yang tertunda
    }
  });

  socket.on('ice-candidate', async ({ from, candidate }) => {
    const peer = state.peers[from];
    if (!peer || !candidate) return;
    // Jika remote description belum di-set, TAHAN candidate dulu agar tidak hilang.
    // Ini krusial untuk koneksi via TURN relay (candidate sedikit & datang dalam burst),
    // yang umum terjadi saat kedua perangkat berada di jaringan berbeda.
    if (!peer.remoteReady) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { log('Gagal menambahkan ICE candidate:', e); }
  });

  socket.on('peer-left', ({ socketId }) => {
    const username = state.peers[socketId]?.username || socketId;
    log('Peer meninggalkan room:', socketId);
    showToast(`${username} meninggalkan room`, 'info');
    removePeer(socketId);
  });

  socket.on('peer-video-state', ({ socketId, enabled }) => {
    log(`Status kamera peer ${socketId}: ${enabled ? 'on' : 'off'}`);
    setRemoteCamOff(socketId, !enabled);
  });

  socket.on('chat-message', appendChatMessage);

  // Server menolak join karena kode room belum pernah dibuat / tidak valid.
  socket.on('room-not-found', () => {
    log('Room tidak ditemukan / belum dibuat');
    cleanupCallState();
    state.inCall = false;
    dom.callScreen.classList.remove('active');
    dom.previewScreen.classList.remove('active');
    dom.joinScreen.classList.add('active');
    showJoinError('Room tidak ditemukan. Pastikan kodenya benar dan room sudah dibuat.');
  });

  // Aksi meeting ditolak server (mis. menghapus meeting milik akun lain).
  socket.on('meeting-error', ({ error }) => {
    showToast(error || 'Aksi meeting gagal', 'error');
  });
}

/* ══════════════════════════════════════════════════
   CREATE ROOM
   ══════════════════════════════════════════════════ */
function closeNmMenu() {
  dom.nmMenu.classList.add('hidden');
  dom.createRoomBtn.setAttribute('aria-expanded', 'false');
  dom.createRoomBtn.querySelector('.nm-chevron').style.transform = '';
}

dom.createRoomBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const opening = dom.nmMenu.classList.contains('hidden');
  dom.nmMenu.classList.toggle('hidden');
  dom.createRoomBtn.setAttribute('aria-expanded', String(opening));
  dom.createRoomBtn.querySelector('.nm-chevron').style.transform = opening ? 'rotate(180deg)' : '';
});

dom.nmMenu.addEventListener('click', (e) => e.stopPropagation());
document.addEventListener('click', closeNmMenu);

dom.nmBtnInstant.addEventListener('click', () => {
  closeNmMenu();
  handleCreateRoom();
});

dom.nmBtnScheduled.addEventListener('click', () => {
  closeNmMenu();
  const isVisible = !dom.meetingsSection.classList.contains('hidden');
  dom.homeContentDivider.classList.toggle('hidden', isVisible);
  dom.meetingsSection.classList.toggle('hidden', isVisible);
  if (!isVisible) withSocket(s => s.emit('get-meetings'));
});

function handleCreateRoom() {
  hideJoinError();
  dom.nmBtnInstant.disabled = true;
  dom.nmBtnInstant.querySelector('.nm-item-title').textContent = 'Membuat room…';
  withSocket(socket => socket.emit('create-room'));
}

function showRoomLinkCard(roomId) {
  const link = `${window.location.origin}/?room=${roomId}`;
  dom.rlcCodeDisplay.textContent = roomId;
  dom.rlcLinkInput.value = link;
  dom.roomLinkCard.classList.remove('hidden');
}

dom.copyLinkBtn.addEventListener('click', () => {
  const link = dom.rlcLinkInput.value;
  navigator.clipboard.writeText(link).then(() => {
    dom.copyLinkBtn.querySelector('span').textContent = 'Tersalin!';
    setTimeout(() => { dom.copyLinkBtn.querySelector('span').textContent = 'Salin'; }, 2000);
  }).catch(() => {
    dom.rlcLinkInput.select();
    document.execCommand('copy');
    showToast('Link disalin!', 'success');
  });
});

/* ══════════════════════════════════════════════════
   JOIN
   ══════════════════════════════════════════════════ */
dom.joinTextBtn.addEventListener('click', handleJoin);
dom.roomIdInput.addEventListener('keydown',  (e) => { if (e.key === 'Enter') handleJoin(); });
dom.usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleJoin(); });

// Tanya server apakah room ada, tanpa bergabung. Mengembalikan salah satu:
//   'exists'  → server memastikan room ada
//   'missing' → server memastikan room TIDAK ada  → ditolak lebih awal
//   'unknown' → server tak menjawab (versi lama / gangguan) → JANGAN menolak,
//               lanjutkan saja; validasi otoritatif tetap dilakukan di join-room.
function checkRoomExists(roomId) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    const timer = setTimeout(() => finish('unknown'), 3000);
    withSocket(socket => {
      socket.emit('check-room', { roomId }, (res) => {
        clearTimeout(timer);
        if (res && typeof res.exists === 'boolean') finish(res.exists ? 'exists' : 'missing');
        else finish('unknown');
      });
    });
  });
}

async function handleJoin() {
  hideJoinError();

  const roomId   = dom.roomIdInput.value.trim();
  const username = dom.usernameInput.value.trim() || 'Pengguna';

  if (!roomId) {
    showJoinError('Kode room tidak boleh kosong.');
    return;
  }

  dom.joinTextBtn.disabled    = true;
  dom.joinTextBtn.textContent = 'Memeriksa room…';

  // Tolak di halaman awal (sebelum buka kamera/masuk lobby) HANYA bila server
  // memastikan room tidak ada. Bila tak bisa dipastikan ('unknown'), lanjut saja —
  // join-room di server tetap memvalidasi dan bisa menolak dengan 'room-not-found'.
  const status = await checkRoomExists(roomId);
  if (status === 'missing') {
    dom.joinTextBtn.disabled    = false;
    dom.joinTextBtn.textContent = 'Gabung';
    showJoinError('Room tidak ditemukan. Pastikan kodenya benar dan room sudah dibuat.');
    return;
  }

  dom.joinTextBtn.textContent = 'Membuka kamera…';

  try {
    await initLocalMedia();
  } catch (err) {
    dom.joinTextBtn.disabled    = false;
    dom.joinTextBtn.textContent = 'Gabung';
    showJoinError('Tidak dapat mengakses kamera/mikrofon: ' + err.message);
    return;
  }

  state.roomId       = roomId;
  state.username     = username;
  state.audioEnabled = true;
  state.videoEnabled = true;

  dom.joinTextBtn.disabled    = false;
  dom.joinTextBtn.textContent = 'Gabung';

  showPreviewScreen();
}

/* ══════════════════════════════════════════════════
   PREVIEW / LOBBY — cek kamera & mik sebelum gabung
   ══════════════════════════════════════════════════ */
function showPreviewScreen() {
  dom.previewVideo.srcObject      = state.localStream;
  dom.previewRoomCode.textContent = state.roomId;
  dom.previewNameInput.value      = state.username;
  updatePreviewAudioUI();
  updatePreviewVideoUI();
  dom.joinScreen.classList.remove('active');
  dom.previewScreen.classList.add('active');
}

function updatePreviewAudioUI() {
  dom.previewToggleAudio.classList.toggle('active',  state.audioEnabled);
  dom.previewToggleAudio.classList.toggle('muted',  !state.audioEnabled);
  dom.previewToggleAudio.querySelector('.icon-on').classList.toggle('hidden',  !state.audioEnabled);
  dom.previewToggleAudio.querySelector('.icon-off').classList.toggle('hidden',  state.audioEnabled);
}

function updatePreviewVideoUI() {
  dom.previewToggleVideo.classList.toggle('active',  state.videoEnabled);
  dom.previewToggleVideo.classList.toggle('muted',  !state.videoEnabled);
  dom.previewToggleVideo.querySelector('.icon-on').classList.toggle('hidden',  !state.videoEnabled);
  dom.previewToggleVideo.querySelector('.icon-off').classList.toggle('hidden',  state.videoEnabled);
  dom.previewCamOff.classList.toggle('hidden', state.videoEnabled);
}

dom.previewToggleAudio.addEventListener('click', () => {
  state.audioEnabled = !state.audioEnabled;
  state.localStream.getAudioTracks().forEach(t => { t.enabled = state.audioEnabled; });
  updatePreviewAudioUI();
});

dom.previewToggleVideo.addEventListener('click', async () => {
  if (dom.previewToggleVideo.disabled) return;
  dom.previewToggleVideo.disabled = true;
  try {
    if (state.videoEnabled) {
      // Matikan: stop track agar lampu kamera benar-benar padam
      state.localStream.getVideoTracks().forEach(track => {
        track.stop();
        state.localStream.removeTrack(track);
      });
      state.videoEnabled = false;
    } else {
      // Nyalakan: minta track kamera baru
      const ns = await navigator.mediaDevices.getUserMedia({ video: CONFIG.MEDIA_CONSTRAINTS.video });
      state.localStream.addTrack(ns.getVideoTracks()[0]);
      dom.previewVideo.srcObject = state.localStream;
      state.videoEnabled = true;
    }
  } catch (err) {
    showToast('Tidak dapat mengakses kamera: ' + err.message, 'error');
    dom.previewToggleVideo.disabled = false;
    return;
  }
  updatePreviewVideoUI();
  dom.previewToggleVideo.disabled = false;
});

dom.previewBackBtn.addEventListener('click', () => {
  // Batal: lepas kamera/mik dan kembali ke beranda
  cleanupCallState();
  state.roomId = '';
  dom.previewScreen.classList.remove('active');
  dom.joinScreen.classList.add('active');
});

dom.previewJoinBtn.addEventListener('click', confirmJoin);
dom.previewNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmJoin(); });

function confirmJoin() {
  state.username = dom.previewNameInput.value.trim() || 'Pengguna';
  state.inCall   = true;
  dom.localUsernameLabel.textContent = state.username;
  dom.headerRoomName.textContent     = state.roomId;
  dom.localVideo.srcObject           = state.localStream;

  syncCallControlsUI();
  switchToCallScreen();

  const socket = getSocket();
  if (socket.connected) {
    socket.emit('join-room',   { roomId: state.roomId, username: state.username });
    socket.emit('video-state', { roomId: state.roomId, enabled: state.videoEnabled });
  } else {
    state.pendingJoin = true;
  }
}

// Perbarui indikator mute lokal sesuai status audio & kamera:
// - kamera menyala  → badge kecil di pojok kanan atas tile
// - kamera mati     → badge "Mikrofon dimatikan" di bawah teks "Kamera mati"
function updateLocalMuteIndicators() {
  const muted  = !state.audioEnabled;
  const camOff = !state.videoEnabled;
  dom.localMutedOverlay.classList.toggle('hidden', !(muted && !camOff));
  dom.localCamOffMute.classList.toggle('hidden',  !(muted && camOff));
}

// Selaraskan tampilan tombol kontrol call-screen dengan pilihan di preview
function syncCallControlsUI() {
  dom.btnAudio.classList.toggle('active',  state.audioEnabled);
  dom.btnAudio.classList.toggle('muted',  !state.audioEnabled);
  dom.btnAudio.querySelector('.icon-on').classList.toggle('hidden',  !state.audioEnabled);
  dom.btnAudio.querySelector('.icon-off').classList.toggle('hidden',  state.audioEnabled);

  dom.btnVideo.classList.toggle('active',  state.videoEnabled);
  dom.btnVideo.classList.toggle('muted',  !state.videoEnabled);
  dom.btnVideo.querySelector('.icon-on').classList.toggle('hidden',  !state.videoEnabled);
  dom.btnVideo.querySelector('.icon-off').classList.toggle('hidden',  state.videoEnabled);
  dom.localCamOff.classList.toggle('hidden', state.videoEnabled);

  updateLocalMuteIndicators();
}

/* ══════════════════════════════════════════════════
   MEDIA — getUserMedia
   ══════════════════════════════════════════════════ */
async function initLocalMedia() {
  log('Meminta akses kamera dan mikrofon…');
  const stream = await navigator.mediaDevices.getUserMedia(CONFIG.MEDIA_CONSTRAINTS);
  state.localStream = stream;
  dom.localVideo.srcObject = stream;
  dom.localCamOff.classList.add('hidden');
  log('Local stream berhasil didapat:', stream.getTracks().map(t => `${t.kind}:${t.label}`));
}

/* ══════════════════════════════════════════════════
   SCREEN TRANSITION
   ══════════════════════════════════════════════════ */
function switchToCallScreen() {
  dom.joinScreen.classList.remove('active');
  dom.previewScreen.classList.remove('active');
  dom.callScreen.classList.add('active');
  startCallTimer();
  setBadge('connecting');
}

function startCallTimer() {
  state.callStartAt  = Date.now();
  state.timerInterval = setInterval(() => {
    dom.callTimer.textContent = formatTime(Math.floor((Date.now() - state.callStartAt) / 1000));
  }, 1000);
}

/* ══════════════════════════════════════════════════
   RTCPeerConnection
   ══════════════════════════════════════════════════ */
async function createPeerConnection(socketId, username, isInitiator) {
  if (state.peers[socketId]) return;

  log(`Membuat RTCPeerConnection dengan ${socketId}, isInitiator=${isInitiator}`);
  const pc = new RTCPeerConnection({
    iceServers:         CONFIG.ICE_SERVERS,
    iceTransportPolicy: CONFIG.ICE_TRANSPORT_POLICY
  });
  state.peers[socketId] = {
    pc, username, videoEl: null, camOffEl: null, camOff: false,
    isInitiator,               // hanya sisi initiator yang memicu ICE restart saat 'failed'
    remoteReady: false,        // true setelah setRemoteDescription berhasil
    pendingCandidates: [],     // ICE candidate yang tiba sebelum remote description siap
    remoteStream: null         // satu MediaStream tempat menampung track remote (audio+video)
  };

  // Pastikan sender audio & video (m-line) ada sejak awal — agar toggle kamera
  // nanti cukup replaceTrack tanpa renegosiasi, termasuk bila join saat cam mati.
  const audioTrack = state.localStream.getAudioTracks()[0];
  const videoTrack = state.localStream.getVideoTracks()[0];
  if (audioTrack) pc.addTrack(audioTrack, state.localStream);
  if (videoTrack) pc.addTrack(videoTrack, state.localStream);
  else            pc.addTransceiver('video', { direction: 'sendrecv' });

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) state.socket.emit('ice-candidate', { to: socketId, candidate });
  };

  pc.oniceconnectionstatechange = () => {
    log(`ICE state [${socketId}]: ${pc.iceConnectionState}`);
    updateConnectionBadge();
    // Koneksi putus (mis. ganti WiFi ↔ seluler) → coba pulihkan tanpa reload.
    // Cukup satu sisi (initiator) yang memulai agar tidak saling tabrakan.
    if (pc.iceConnectionState === 'failed') {
      const peer = state.peers[socketId];
      if (peer && peer.isInitiator) restartIce(socketId);
    }
  };

  pc.onconnectionstatechange = () => {
    log(`Connection state [${socketId}]: ${pc.connectionState}`);
    updateConnectionBadge();
  };

  pc.ontrack = ({ track, streams }) => {
    log(`Remote track diterima dari ${socketId} (${track.kind})`);
    const peer = state.peers[socketId];
    if (!peer) return;
    // Jangan bergantung pada streams[0]: saat peer join dengan kamera mati, m-line
    // video dibuat via addTransceiver tanpa MediaStream, sehingga streams kosong dan
    // video tak akan pernah tampil walau kamera dinyalakan setelah join. Solusinya:
    // kumpulkan setiap track remote ke SATU MediaStream milik peer ini. Track video
    // (meski awalnya belum ada frame) langsung punya tile, dan frame akan muncul
    // begitu peer melakukan replaceTrack — tanpa perlu ontrack baru.
    if (!peer.remoteStream) peer.remoteStream = new MediaStream();
    peer.remoteStream.addTrack(track);
    addRemoteVideo(socketId, peer.remoteStream);
  };

  if (isInitiator) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      state.socket.emit('offer', { to: socketId, sdp: pc.localDescription });
      log('Mengirim offer ke', socketId);
    } catch (err) {
      log('Gagal membuat offer:', err);
    }
  }

  updateWaitingTile();
  updateVideoGridLayout();
}

// ICE restart: buat offer baru dengan iceRestart agar jalur koneksi
// dinegosiasi ulang saat koneksi 'failed' (mis. perpindahan jaringan),
// tanpa perlu keluar-masuk room. Sisi lain menanganinya lewat handler 'offer'.
async function restartIce(socketId) {
  const peer = state.peers[socketId];
  if (!peer) return;
  try {
    log('Mencoba ICE restart untuk', socketId);
    const offer = await peer.pc.createOffer({ iceRestart: true });
    await peer.pc.setLocalDescription(offer);
    state.socket.emit('offer', { to: socketId, sdp: peer.pc.localDescription });
  } catch (e) {
    log('ICE restart gagal:', e);
  }
}

// Tandai remote description sudah siap, lalu tambahkan semua ICE candidate
// yang sempat ditahan. Tanpa ini, candidate yang tiba lebih dulu akan hilang
// dan koneksi (terutama via TURN antar-jaringan) bisa gagal total.
async function flushPendingCandidates(peer) {
  if (!peer) return;
  peer.remoteReady = true;
  const queued = peer.pendingCandidates;
  peer.pendingCandidates = [];
  for (const candidate of queued) {
    try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { log('Gagal menambahkan ICE candidate tertunda:', e); }
  }
}

function removePeer(socketId) {
  const peer = state.peers[socketId];
  if (!peer) return;
  peer.pc.close();
  if (peer.videoEl) {
    const tile = peer.videoEl.closest('.video-tile');
    if (tile) tile.remove();
  }
  delete state.peers[socketId];
  updateWaitingTile();
  updateVideoGridLayout();
  updateConnectionBadge();
}

/* ══════════════════════════════════════════════════
   REMOTE VIDEO TILE
   ══════════════════════════════════════════════════ */
function addRemoteVideo(socketId, stream) {
  const existing = document.getElementById(`tile-${socketId}`);
  if (existing) existing.remove();

  const peer  = state.peers[socketId];
  const tile  = document.createElement('div');
  tile.className = 'video-tile remote-tile';
  tile.id = `tile-${socketId}`;

  const video = document.createElement('video');
  video.autoplay    = true;
  video.playsInline = true;                 // properti benar (huruf I besar) — wajib untuk autoplay inline di iOS/Safari
  video.setAttribute('playsinline', '');    // atribut HTML setara — jaga-jaga untuk WebView/browser lama
  video.srcObject   = stream;
  // Beberapa browser mobile menolak autoplay diam-diam; picu play() eksplisit.
  video.play().catch(() => { /* akan diputar saat ada interaksi/track aktif */ });

  // Overlay "Kamera mati" — disembunyikan default, ditampilkan saat peer off-cam
  const camOff = document.createElement('div');
  camOff.className = 'tile-cam-off hidden';
  camOff.innerHTML = '<div class="tile-avatar-circle"></div><span class="tile-cam-off-text">Kamera mati</span>';

  const label = document.createElement('div');
  label.className = 'tile-label';
  label.innerHTML = `<span>${peer ? escHtml(peer.username) : 'Peserta'}</span>`;

  tile.appendChild(video);
  tile.appendChild(camOff);
  tile.appendChild(label);
  dom.remoteTiles.appendChild(tile);
  if (peer) {
    peer.videoEl  = video;
    peer.camOffEl = camOff;
    applyRemoteCamOff(peer);   // terapkan status yang mungkin sudah diketahui
  }

  if (!state.statsInterval) startStatsPolling();
  updateWaitingTile();
  updateVideoGridLayout();
  setBadge('connected');
}

/* ══════════════════════════════════════════════════
   STATUS KAMERA PEER (remote cam on/off)
   ══════════════════════════════════════════════════ */
function applyRemoteCamOff(peer) {
  if (!peer.videoEl || !peer.camOffEl) return;
  // Sembunyikan video (frame beku) & tampilkan overlay saat kamera peer mati
  peer.videoEl.classList.toggle('hidden', peer.camOff);
  peer.camOffEl.classList.toggle('hidden', !peer.camOff);
}

function setRemoteCamOff(socketId, off) {
  const peer = state.peers[socketId];
  if (!peer) return;
  peer.camOff = off;
  applyRemoteCamOff(peer);
}

/* ══════════════════════════════════════════════════
   VIDEO GRID LAYOUT
   ══════════════════════════════════════════════════ */
function updateVideoGridLayout() {
  // Pertahankan kelas stats-open / chat-open saat layout grid diperbarui
  const statsOpen = dom.videoGrid.classList.contains('stats-open');
  const chatOpen  = dom.videoGrid.classList.contains('chat-open');
  dom.videoGrid.className = `video-grid peers-${Object.keys(state.peers).length}`;
  if (statsOpen) dom.videoGrid.classList.add('stats-open');
  if (chatOpen)  dom.videoGrid.classList.add('chat-open');
}

function updateWaitingTile() {
  dom.waitingTile.classList.toggle('hidden', Object.keys(state.peers).length > 0);
}

/* ══════════════════════════════════════════════════
   CONNECTION BADGE
   ══════════════════════════════════════════════════ */
function updateConnectionBadge() {
  const peers = Object.values(state.peers);
  if (!peers.length) { setBadge('connecting'); return; }
  const anyConnected = peers.some(p =>
    p.pc.iceConnectionState === 'connected' || p.pc.iceConnectionState === 'completed'
  );
  const anyFailed = peers.some(p =>
    p.pc.iceConnectionState === 'failed' || p.pc.connectionState === 'failed'
  );
  if (anyConnected)   setBadge('connected');
  else if (anyFailed) setBadge('failed');
  else                setBadge('connecting');
}

/* ══════════════════════════════════════════════════
   getStats() — MONITORING STATISTIK
   ══════════════════════════════════════════════════ */
const _prevStats = {};

async function collectStats(pc, socketId) {
  const report = await pc.getStats();
  let rtt = null, packetLoss = null, jitter = null, throughput = null, fps = null, resolution = null;
  const prev = _prevStats[socketId] || {};

  report.forEach(stat => {
    if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
      if (prev.outboundVideo?.timestamp) {
        const dtMs   = stat.timestamp - prev.outboundVideo.timestamp;
        const dBytes = (stat.bytesSent || 0) - (prev.outboundVideo.bytesSent || 0);
        if (dtMs > 0) throughput = Math.round((dBytes * 8) / dtMs);
      }
      prev.outboundVideo = { ...stat };
      if (stat.frameWidth && stat.frameHeight) resolution = `${stat.frameWidth}×${stat.frameHeight}`;
      if (stat.framesPerSecond != null) fps = Math.round(stat.framesPerSecond);
    }

    if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
      if (stat.packetsReceived != null && stat.packetsLost != null) {
        const total = stat.packetsReceived + stat.packetsLost;
        packetLoss  = total > 0 ? parseFloat(((stat.packetsLost / total) * 100).toFixed(2)) : 0;
      }
      if (stat.jitter != null) jitter = parseFloat((stat.jitter * 1000).toFixed(2));
    }

    if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
      if (stat.currentRoundTripTime != null) {
        rtt = parseFloat((stat.currentRoundTripTime * 1000).toFixed(2));
      }
    }
  });

  _prevStats[socketId] = prev;
  return { rtt, packetLoss, jitter, throughput, fps, resolution };
}

function startStatsPolling() {
  log('Memulai polling getStats setiap', CONFIG.STATS_INTERVAL_MS, 'ms');

  state.statsInterval = setInterval(async () => {
    const peers = Object.entries(state.peers);
    if (!peers.length) return;

    const activePeer = peers.find(([, p]) =>
      p.pc.connectionState === 'connected' ||
      p.pc.iceConnectionState === 'connected' ||
      p.pc.iceConnectionState === 'completed'
    );
    if (!activePeer) return;

    const [socketId, peerState] = activePeer;
    const stats = await collectStats(peerState.pc, socketId);

    updateStatUI(dom.statRTT,        stats.rtt,        v => v < 150 ? 'good' : v < 300 ? 'warn' : 'bad');
    updateStatUI(dom.statLoss,       stats.packetLoss, v => v < 1   ? 'good' : v < 5   ? 'warn' : 'bad');
    updateStatUI(dom.statJitter,     stats.jitter,     v => v < 30  ? 'good' : v < 60  ? 'warn' : 'bad');
    updateStatUI(dom.statThroughput, stats.throughput, v => v > 500 ? 'good' : v > 200 ? 'warn' : 'bad');
    updateStatUI(dom.statFPS,        stats.fps,        v => v >= 24 ? 'good' : v >= 15 ? 'warn' : 'bad');

    if (stats.resolution) {
      dom.statRes.textContent = stats.resolution;
      const card = dom.statRes.closest('.stat-card');
      if (card) {
        const [w] = stats.resolution.split('×').map(Number);
        card.className = 'stat-card ' + (w >= 1280 ? 'good' : w >= 640 ? 'warn' : 'bad');
      }
    }

    const entry = {
      ts:         new Date().toISOString(),
      rtt:        stats.rtt        ?? '',
      loss:       stats.packetLoss ?? '',
      jitter:     stats.jitter     ?? '',
      throughput: stats.throughput ?? '',
      fps:        stats.fps        ?? '',
      res:        stats.resolution ?? ''
    };
    state.statsLog.push(entry);
    appendLogEntry(entry);

    // Kirim ke server untuk disimpan di SQLite
    if (state.socket && state.inCall) {
      state.socket.emit('stats-update', {
        roomId:       state.roomId,
        rtt_ms:       stats.rtt,
        jitter_ms:    stats.jitter,
        packet_loss:  stats.packetLoss,
        bitrate_kbps: stats.throughput,
        fps:          stats.fps,
        resolution:   stats.resolution
      });
    }
  }, CONFIG.STATS_INTERVAL_MS);
}

function updateStatUI(el, value, ratingFn) {
  if (value == null) {
    el.textContent = '—';
    const card = el.closest('.stat-card');
    if (card) card.className = 'stat-card';
    return;
  }
  el.textContent = value;
  const card = el.closest('.stat-card');
  if (card) card.className = 'stat-card ' + ratingFn(value);
}

function appendLogEntry(entry) {
  const div = document.createElement('div');
  div.className = 'log-entry';
  const ts = entry.ts.split('T')[1].split('.')[0];
  div.innerHTML = `
    <span class="log-ts">${ts}</span>
    <span>RTT:${entry.rtt}ms Loss:${entry.loss}% Jitter:${entry.jitter}ms BW:${entry.throughput}kbps FPS:${entry.fps}</span>
  `;
  dom.statsLog.appendChild(div);
  dom.statsLog.scrollTop = dom.statsLog.scrollHeight;
}

/* ══════════════════════════════════════════════════
   EXPORT LOG → CSV
   ══════════════════════════════════════════════════ */
dom.exportLogBtn.addEventListener('click', exportCSV);

function exportCSV() {
  if (!state.statsLog.length) { alert('Belum ada data log yang tersedia.'); return; }

  const SEP = ';';   // pemisah kolom (locale Excel Indonesia memakai titik-koma)

  // Angka desimal pakai koma agar dikenali sebagai angka oleh Excel lokal Indonesia
  const num = v => (v === '' || v == null) ? '' : String(v).replace('.', ',');

  // ISO timestamp → tanggal & jam lokal yang mudah dibaca (dd/mm/yyyy HH:MM:SS)
  const fmtTs = iso => {
    const d = new Date(iso);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ` +
           `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  const headers = ['Waktu', 'RTT (ms)', 'Packet Loss (%)', 'Jitter (ms)',
                   'Throughput (kbps)', 'FPS', 'Resolusi'];

  const lines = [
    'sep=' + SEP,              // baris petunjuk agar Excel memakai pemisah yang benar
    headers.join(SEP),
    ...state.statsLog.map(e => [
      `="${fmtTs(e.ts)}"`,                       // dibungkus ="..." → dipaksa jadi TEKS
                                                 // agar Excel tak menampilkan #### saat kolom sempit
      num(e.rtt),
      num(e.loss),
      num(e.jitter),
      num(e.throughput),
      num(e.fps),
      String(e.res ?? '').replace('×', 'x')      // pakai 'x' ASCII (bukan '×') → bebas masalah encoding
    ].join(SEP))
  ];

  // Konten sengaja ASCII (resolusi pakai 'x') agar bebas masalah encoding di Excel.
  // \r\n = akhir baris standar Excel. BOM dipertahankan (tak berefek buruk pada konten ASCII).
  const csv  = '﻿' + lines.join('\r\n');
  const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a    = document.createElement('a');
  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href     = url;
  a.download = `webrtc-stats_${state.roomId}_${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════
   MEETINGS — PENJADWALAN
   ══════════════════════════════════════════════════ */
dom.scheduleToggleBtn.addEventListener('click', () => {
  const isHidden = dom.scheduleForm.classList.toggle('hidden');
  dom.scheduleToggleBtn.querySelector('span').textContent = isHidden ? 'Jadwalkan' : 'Tutup';
});

dom.cancelScheduleBtn.addEventListener('click', hideScheduleForm);

function hideScheduleForm() {
  dom.scheduleForm.classList.add('hidden');
  dom.scheduleToggleBtn.querySelector('span').textContent = 'Jadwalkan';
  dom.sfTitle.value    = '';
  dom.sfHost.value     = '';
  dom.sfDatetime.value = '';
}

dom.submitScheduleBtn.addEventListener('click', () => {
  const title        = dom.sfTitle.value.trim();
  const host_name    = dom.sfHost.value.trim();
  const scheduled_at = dom.sfDatetime.value;

  if (!title)        { showToast('Isi judul meeting', 'error');     return; }
  if (!host_name)    { showToast('Isi nama host', 'error');         return; }
  if (!scheduled_at) { showToast('Pilih tanggal & waktu', 'error'); return; }

  const token = window.getAuthToken ? window.getAuthToken() : null;
  withSocket(s => s.emit('schedule-meeting', { title, host_name, scheduled_at, token }));
});

// Bangun link "Tambah ke Google Calendar" (dibuat di sisi browser — gratis, tanpa server).
// Reminder/notifikasi ditangani oleh Google Calendar user (pakai setelan default mereka).
function googleCalendarUrl(m) {
  const start = new Date(m.scheduled_at);
  const end   = new Date(start.getTime() + 60 * 60 * 1000);          // durasi default 1 jam
  const fmt   = d => d.toISOString().replace(/[-:]|\.\d{3}/g, '');   // → 20260701T140000Z
  const join  = window.location.origin + m.link;
  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     m.title,
    dates:    `${fmt(start)}/${fmt(end)}`,
    details:  `Meeting WebRTC — Kelompok 3\nHost: ${m.host_name}\nGabung: ${join}`,
    location: join
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderMeetings(meetings) {
  if (!meetings || !meetings.length) {
    dom.meetingsList.innerHTML = '<p class="meetings-empty">Belum ada meeting terjadwal</p>';
    return;
  }

  dom.meetingsList.innerHTML = meetings.map(m => {
    const dt = new Date(m.scheduled_at).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="meeting-item" data-id="${escHtml(m.id)}">
        <div class="mi-info">
          <span class="mi-title">${escHtml(m.title)}</span>
          <span class="mi-meta">${dt} &middot; Host: ${escHtml(m.host_name)}</span>
          <span class="mi-link">${escHtml(window.location.origin + m.link)}</span>
        </div>
        <div class="mi-actions">
          <button class="btn-mi-join"   onclick="window._joinMeeting('${escHtml(m.id)}')">Mulai</button>
          <a class="btn-mi-cal" href="${escHtml(googleCalendarUrl(m))}" target="_blank" rel="noopener" title="Tambahkan ke Google Calendar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
            <span>Kalender</span>
          </a>
          <button class="btn-mi-delete" onclick="window._deleteMeeting('${escHtml(m.id)}')">Hapus</button>
        </div>
      </div>
    `;
  }).join('');
}

window._joinMeeting = function(roomId) {
  dom.roomIdInput.value = roomId;
  handleJoin();
};

window._deleteMeeting = function(id) {
  const token = (typeof window.getAuthToken === 'function') ? window.getAuthToken() : null;
  withSocket(s => s.emit('delete-meeting', { id, token }));
};

/* ══════════════════════════════════════════════════
   KONTROL: AUDIO / VIDEO / STATS / HANGUP
   ══════════════════════════════════════════════════ */
dom.btnAudio.addEventListener('click', () => {
  state.audioEnabled = !state.audioEnabled;
  state.localStream.getAudioTracks().forEach(t => { t.enabled = state.audioEnabled; });
  dom.btnAudio.classList.toggle('active',  state.audioEnabled);
  dom.btnAudio.classList.toggle('muted',  !state.audioEnabled);
  dom.btnAudio.querySelector('.icon-on').classList.toggle('hidden',  !state.audioEnabled);
  dom.btnAudio.querySelector('.icon-off').classList.toggle('hidden',  state.audioEnabled);
  updateLocalMuteIndicators();
});

dom.btnVideo.addEventListener('click', toggleVideo);

async function toggleVideo() {
  // Cegah klik ganda saat sedang memproses (getUserMedia butuh waktu)
  if (dom.btnVideo.disabled) return;
  dom.btnVideo.disabled = true;

  try {
    if (state.videoEnabled) {
      // ── MATIKAN KAMERA: stop track agar lampu kamera benar-benar padam ──
      state.localStream.getVideoTracks().forEach(track => {
        track.stop();                       // melepas perangkat kamera (lampu mati)
        state.localStream.removeTrack(track);
      });
      // Berhenti mengirim video ke semua peer, tanpa renegosiasi
      Object.values(state.peers).forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(null);
      });
      state.videoEnabled = false;
    } else {
      // ── NYALAKAN KAMERA: minta track video baru ──
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: CONFIG.MEDIA_CONSTRAINTS.video
      });
      const newTrack = newStream.getVideoTracks()[0];
      state.localStream.addTrack(newTrack);
      dom.localVideo.srcObject = state.localStream;
      // Kirim track baru ke semua peer (ganti track null di sender video)
      Object.values(state.peers).forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => !s.track || s.track.kind === 'video');
        if (sender) sender.replaceTrack(newTrack);
        else pc.addTrack(newTrack, state.localStream); // peer yang join saat cam mati
      });
      state.videoEnabled = true;
    }
  } catch (err) {
    log('Gagal mengganti status kamera:', err);
    showToast('Tidak dapat mengakses kamera: ' + err.message, 'error');
    dom.btnVideo.disabled = false;
    return;
  }

  // Update tampilan tombol & overlay
  dom.btnVideo.classList.toggle('active',  state.videoEnabled);
  dom.btnVideo.classList.toggle('muted',  !state.videoEnabled);
  dom.btnVideo.querySelector('.icon-on').classList.toggle('hidden',  !state.videoEnabled);
  dom.btnVideo.querySelector('.icon-off').classList.toggle('hidden',  state.videoEnabled);
  dom.localCamOff.classList.toggle('hidden', state.videoEnabled);
  // Kamera berubah → pindahkan indikator mute (pojok tile ↔ bawah teks "Kamera mati")
  updateLocalMuteIndicators();

  // Beri tahu peer lain agar mereka menampilkan/menyembunyikan overlay "Kamera mati"
  if (state.socket && state.inCall) {
    state.socket.emit('video-state', { roomId: state.roomId, enabled: state.videoEnabled });
  }
  dom.btnVideo.disabled = false;
}

/* ══════════════════════════════════════════════════
   PANEL STATISTIK (kiri) — independen dari chat
   ══════════════════════════════════════════════════ */
function openStats() {
  dom.statsPanel.classList.add('open');
  dom.btnStats.classList.add('active');
  dom.videoGrid.classList.add('stats-open');
}
function closeStats() {
  dom.statsPanel.classList.remove('open');
  dom.btnStats.classList.remove('active');
  dom.videoGrid.classList.remove('stats-open');
}

dom.btnStats.addEventListener('click', () => {
  if (dom.statsPanel.classList.contains('open')) closeStats();
  else openStats();
});
dom.statsCloseBtn.addEventListener('click', closeStats);

/* ══════════════════════════════════════════════════
   CHAT (kanan) — independen dari statistik
   ══════════════════════════════════════════════════ */
function openChat() {
  dom.chatPanel.classList.add('open');
  dom.btnChat.classList.add('active');
  dom.videoGrid.classList.add('chat-open');
  state.chatUnread = 0;
  updateChatBadge();
  dom.chatInput.focus();
}
function closeChat() {
  dom.chatPanel.classList.remove('open');
  dom.btnChat.classList.remove('active');
  dom.videoGrid.classList.remove('chat-open');
}
function updateChatBadge() {
  if (state.chatUnread > 0) {
    dom.chatBadge.textContent = state.chatUnread > 9 ? '9+' : String(state.chatUnread);
    dom.chatBadge.classList.remove('hidden');
  } else {
    dom.chatBadge.classList.add('hidden');
  }
}

dom.btnChat.addEventListener('click', () => {
  if (dom.chatPanel.classList.contains('open')) closeChat();
  else openChat();
});
dom.chatCloseBtn.addEventListener('click', closeChat);

function sendChat() {
  const text = dom.chatInput.value.trim();
  if (!text) return;
  if (state.socket && state.inCall) {
    state.socket.emit('chat-message', { roomId: state.roomId, text });
  }
  dom.chatInput.value = '';
}
dom.chatSendBtn.addEventListener('click', sendChat);
dom.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function appendChatMessage({ socketId, username, text, ts }) {
  // Hapus placeholder "belum ada pesan" bila masih ada
  const empty = dom.chatMessages.querySelector('.chat-empty');
  if (empty) empty.remove();

  const own  = state.socket && socketId === state.socket.id;
  const time = new Date(ts || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const wrap = document.createElement('div');
  wrap.className = 'chat-msg' + (own ? ' chat-msg--own' : '');
  wrap.innerHTML = `
    <div class="chat-msg-meta">
      <span class="chat-msg-name">${own ? 'Kamu' : escHtml(username)}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-bubble">${escHtml(text)}</div>
  `;
  dom.chatMessages.appendChild(wrap);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;

  // Badge "belum dibaca" bila panel tertutup & pesan dari orang lain
  if (!own && !dom.chatPanel.classList.contains('open')) {
    state.chatUnread++;
    updateChatBadge();
  }
}

function resetChat() {
  dom.chatMessages.innerHTML = '<p class="chat-empty">Belum ada pesan. Mulai percakapan!</p>';
  dom.chatInput.value = '';
  state.chatUnread = 0;
  updateChatBadge();
  closeChat();
}

dom.btnHangup.addEventListener('click', hangup);

function cleanupCallState() {
  clearInterval(state.timerInterval);
  clearInterval(state.statsInterval);
  state.timerInterval = null;
  state.statsInterval = null;
  state.inCall        = false;

  Object.keys(state.peers).forEach(id => {
    state.peers[id].pc.close();
    delete state.peers[id];
  });

  if (state.localStream) {
    state.localStream.getTracks().forEach(t => t.stop());
    state.localStream = null;
  }

  dom.remoteTiles.innerHTML   = '';
  dom.joinTextBtn.disabled    = false;
  dom.joinTextBtn.textContent = 'Gabung';
  dom.localCamOff.classList.remove('hidden');
  resetChat();
  closeStats();
}

function hangup() {
  log('Menutup panggilan…');
  cleanupCallState();

  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }

  dom.callScreen.classList.remove('active');
  dom.joinScreen.classList.add('active');
  hideJoinError();

  // Sambung kembali untuk operasi pre-call (meetings, create-room)
  setTimeout(() => getSocket(), 200);

  log('Panggilan ditutup.');
}

/* ══════════════════════════════════════════════════
   AUTO-JOIN VIA URL PARAMETER (?room=KODE)
   ══════════════════════════════════════════════════ */
(function checkUrlRoom() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  if (roomId) {
    dom.roomIdInput.value = roomId;
    setTimeout(() => handleJoin(), 400);
  }
})();

/* ══════════════════════════════════════════════════
   INIT — sambungkan socket untuk operasi pre-call
   ══════════════════════════════════════════════════ */
getSocket();
