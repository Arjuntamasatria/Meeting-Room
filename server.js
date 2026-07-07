'use strict';

const express    = require('express');
const http       = require('http');
const crypto     = require('crypto');
const { Server } = require('socket.io');
const path       = require('path');
const db         = require('./database.js');

const PORT               = process.env.PORT || 3000;

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// Percayai header proxy (X-Forwarded-For) agar req.ip = IP asli klien di balik
// ngrok/reverse-proxy — penting supaya rate limit dihitung per klien, bukan per proxy.
app.set('trust proxy', true);

app.use(express.json());
app.use(express.static(path.join(__dirname), {
  // Cegah browser memakai cache lama (hindari file HTML/CSS/JS usang saat ada perubahan)
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

/* ══════════════════════════════════════════════════
   AUTH — helper (pakai crypto bawaan, tanpa library)
   ══════════════════════════════════════════════════ */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const test = crypto.scryptSync(pw, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}
// Buat token sesi baru dengan masa berlaku (default 7 hari). Token yang lewat
// masa berlaku ditolak oleh getUserByToken, membatasi dampak bila token bocor.
function createToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    "INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
  ).run(token, userId);
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  try {
    // Tolak token yang sudah kedaluwarsa (expires_at NULL = token lama sebelum
    // fitur expiry, tetap dianggap valid agar tidak memutus sesi yang ada).
    return db.prepare(
      `SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token = ? AND (t.expires_at IS NULL OR datetime(t.expires_at) > datetime('now'))`
    ).get(token) || null;
  } catch { return null; }
}
function tokenFromReq(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

// Rate limiter sederhana per-IP (tanpa dependensi tambahan). Mencegah brute-force
// pada login/signup. Bucket disimpan di memori dan direset tiap jendela waktu.
const rateBuckets = new Map();
function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const ip  = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let bucket = rateBuckets.get(ip);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(ip, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' });
    }
    next();
  };
}

/* ══════════════════════════════════════════════════
   AUTH — endpoint REST
   ══════════════════════════════════════════════════ */
app.post('/api/signup', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Lengkapi nama, email, dan password.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  }
  try {
    const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name, String(email).toLowerCase(), hashPassword(password));
    const token = createToken(info.lastInsertRowid);
    res.json({ token, user: { name, email: String(email).toLowerCase() } });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Email sudah terdaftar.' });
    }
    console.warn('[AUTH] signup:', e.message);
    res.status(500).json({ error: 'Gagal mendaftar.' });
  }
});

app.post('/api/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email atau password salah.' });
  }
  const token = createToken(user.id);
  res.json({ token, user: { name: user.name, email: user.email } });
});

app.get('/api/me', (req, res) => {
  const user = getUserByToken(tokenFromReq(req));
  if (!user) return res.status(401).json({ error: 'Tidak terautentikasi.' });
  res.json({ user: { name: user.name, email: user.email } });
});

app.post('/api/logout', (req, res) => {
  try { db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(tokenFromReq(req)); } catch {}
  res.json({ ok: true });
});

// rooms: Map<roomId, Map<socketId, { username, roomId }>>
const rooms = new Map();

function genId(len = 6) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}

io.on('connection', (socket) => {
  console.log(`[+] Socket terhubung: ${socket.id}`);

  // ── CREATE ROOM ─────────────────────────────────────────────────────────────
  socket.on('create-room', () => {
    let roomId;
    do { roomId = genId(6); } while (rooms.has(roomId));
    rooms.set(roomId, new Map());
    socket.emit('room-created', { roomId });
    console.log(`[+] Room dibuat: ${roomId}`);
  });

  // ── CHECK ROOM ──────────────────────────────────────────────────────────────
  // Cek keberadaan room TANPA bergabung — dipakai halaman awal agar user langsung
  // ditolak sebelum masuk lobby (buka kamera/mik). Balas via callback ack.
  socket.on('check-room', ({ roomId }, ack) => {
    const exists = !!roomId && (
      rooms.has(roomId) ||
      !!db.prepare('SELECT 1 FROM meetings WHERE id = ?').get(roomId)
    );
    if (typeof ack === 'function') ack({ exists });
  });

  // ── JOIN ROOM ────────────────────────────────────────────────────────────────
  socket.on('join-room', ({ roomId, username }) => {
    if (!roomId) return;

    // Room hanya valid bila SUDAH dibuat: ada di memori (via 'create-room' atau
    // sedang aktif) ATAU terdaftar sebagai meeting terjadwal di database.
    // Menolak kode acak yang belum pernah dibuat.
    let room = rooms.get(roomId);
    if (!room) {
      const scheduled = db.prepare('SELECT 1 FROM meetings WHERE id = ?').get(roomId);
      if (!scheduled) {
        socket.emit('room-not-found');
        console.log(`[!] Join ditolak, room "${roomId}" tidak ada (dari ${socket.id})`);
        return;
      }
      // Meeting terjadwal yang baru pertama kali dibuka → aktifkan room-nya.
      room = new Map();
      rooms.set(roomId, room);
    }

    // Tanpa batas jumlah peserta per room

    // Kirim daftar peer yang sudah ada ke peer baru
    const existingPeers = [...room.entries()].map(([socketId, data]) => ({
      socketId,
      username: data.username
    }));
    socket.emit('room-peers', { peers: existingPeers });

    // Beritahu semua peer yang sudah ada
    room.forEach((_, existingSocketId) => {
      io.to(existingSocketId).emit('peer-joined', { socketId: socket.id, username });
    });

    room.set(socket.id, { username, roomId });
    socket.join(roomId);

    try {
      db.prepare('INSERT INTO sessions (room_id, peer_id) VALUES (?, ?)').run(roomId, socket.id);
    } catch (e) {
      console.warn('[DB] session insert:', e.message);
    }

    // Emit 'ready' saat ada >= 2 peer di room
    if (room.size >= 2) {
      io.to(roomId).emit('ready', { roomId });
    }

    console.log(`[~] ${username} (${socket.id}) bergabung ke room "${roomId}" (${room.size} peserta)`);
  });

  // ── SIGNALING ────────────────────────────────────────────────────────────────
  socket.on('offer',         ({ to, sdp })       => io.to(to).emit('offer',         { from: socket.id, sdp }));
  socket.on('answer',        ({ to, sdp })       => io.to(to).emit('answer',        { from: socket.id, sdp }));
  socket.on('ice-candidate', ({ to, candidate }) => io.to(to).emit('ice-candidate', { from: socket.id, candidate }));

  // ── MEDIA STATE (kamera on/off) ──────────────────────────────────────────────
  socket.on('video-state', ({ roomId, enabled }) => {
    socket.to(roomId).emit('peer-video-state', { socketId: socket.id, enabled });
  });

  // ── CHAT ──────────────────────────────────────────────────────────────────────
  socket.on('chat-message', ({ roomId, text }) => {
    if (!roomId || !text) return;
    const sender   = rooms.get(roomId)?.get(socket.id);
    const username = sender?.username || 'Peserta';
    io.to(roomId).emit('chat-message', {
      socketId: socket.id,
      username,
      text: String(text).slice(0, 1000),   // batasi panjang pesan
      ts: Date.now()
    });
  });

  // ── STATS UPDATE ─────────────────────────────────────────────────────────────
  socket.on('stats-update', (data) => {
    const { roomId, rtt_ms, jitter_ms, packet_loss, bitrate_kbps, fps, resolution } = data;
    try {
      db.prepare(`
        INSERT INTO network_stats (room_id, peer_id, rtt_ms, jitter_ms, packet_loss, bitrate_kbps, fps, resolution)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        roomId, socket.id,
        rtt_ms       ?? null, jitter_ms   ?? null,
        packet_loss  ?? null, bitrate_kbps ?? null,
        fps          ?? null, resolution  ?? null
      );
    } catch (e) {
      console.warn('[DB] stats insert:', e.message);
    }
  });

  // ── SCHEDULE MEETING ─────────────────────────────────────────────────────────
  socket.on('schedule-meeting', ({ title, host_name, scheduled_at, token }) => {
    // Kode room 7 karakter; ulangi bila kebetulan sudah dipakai meeting lain
    // (id adalah primary key, jadi harus unik).
    let id;
    do { id = genId(7); } while (db.prepare('SELECT 1 FROM meetings WHERE id = ?').get(id));
    const link = `/?room=${id}`;
    const user = getUserByToken(token);  // null bila tamu — user_id dipakai untuk
                                         // membatasi siapa yang boleh menghapus meeting.
    try {
      db.prepare(`
        INSERT INTO meetings (id, title, host_name, scheduled_at, link, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, title, host_name, scheduled_at, link, user ? user.id : null);
      socket.emit('meeting-scheduled', { id, title, host_name, scheduled_at, link });
      console.log(`[+] Meeting dijadwalkan: "${title}" oleh ${host_name}`);
    } catch (e) {
      console.warn('[DB] meeting insert:', e.message);
    }
  });

  // ── GET MEETINGS ──────────────────────────────────────────────────────────────
  socket.on('get-meetings', () => {
    try {
      const meetings = db.prepare(
        `SELECT * FROM meetings WHERE datetime(scheduled_at) >= datetime('now') ORDER BY scheduled_at ASC`
      ).all();
      socket.emit('meetings-list', { meetings });
    } catch (e) {
      console.warn('[DB] get meetings:', e.message);
      socket.emit('meetings-list', { meetings: [] });
    }
  });

  // ── DELETE MEETING ────────────────────────────────────────────────────────────
  socket.on('delete-meeting', ({ id, token }) => {
    try {
      const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id);
      if (!meeting) { socket.emit('meeting-deleted', { id }); return; }
      // Meeting milik akun terdaftar hanya boleh dihapus oleh pemiliknya.
      // Meeting tamu (user_id NULL) bersifat anonim → boleh dihapus siapa saja.
      if (meeting.user_id != null) {
        const user = getUserByToken(token);
        if (!user || user.id !== meeting.user_id) {
          socket.emit('meeting-error', { error: 'Meeting ini milik akun lain — tidak bisa dihapus.' });
          return;
        }
      }
      db.prepare('DELETE FROM meetings WHERE id = ?').run(id);
      socket.emit('meeting-deleted', { id });
    } catch (e) {
      console.warn('[DB] delete meeting:', e.message);
    }
  });

  // ── GET STATS LOG ─────────────────────────────────────────────────────────────
  socket.on('get-stats-log', ({ roomId }) => {
    try {
      const stats = db.prepare(
        'SELECT * FROM network_stats WHERE room_id = ? ORDER BY timestamp ASC'
      ).all(roomId);
      socket.emit('stats-log', { stats });
    } catch (e) {
      console.warn('[DB] get stats log:', e.message);
      socket.emit('stats-log', { stats: [] });
    }
  });

  // ── DISCONNECT ────────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Socket putus: ${socket.id}`);

    try {
      db.prepare(`UPDATE sessions SET left_at = datetime('now') WHERE peer_id = ? AND left_at IS NULL`)
        .run(socket.id);
    } catch (e) {
      console.warn('[DB] session update:', e.message);
    }

    rooms.forEach((room, roomId) => {
      if (room.has(socket.id)) {
        room.delete(socket.id);
        room.forEach((_, remainingId) => {
          io.to(remainingId).emit('peer-left', { socketId: socket.id });
        });
        console.log(`[~] ${socket.id} keluar dari room "${roomId}" (sisa: ${room.size})`);
        if (room.size === 0) {
          rooms.delete(roomId);
          console.log(`[~] Room "${roomId}" kosong, dihapus`);
        }
      }
    });
  });
});

/* ══════════════════════════════════════════════════
   PEMBERSIHAN DATA — statistik jaringan ditulis tiap detik per peer,
   jadi tabel network_stats bisa membengkak. Buang data lebih tua dari
   1 hari tiap jam agar file DB tetap ramping. Sesi yang menggantung
   (tidak sempat menandai left_at) juga ditutup.
   ══════════════════════════════════════════════════ */
setInterval(() => {
  try {
    db.prepare("DELETE FROM network_stats WHERE timestamp < datetime('now', '-1 day')").run();
    db.prepare("UPDATE sessions SET left_at = datetime('now') WHERE left_at IS NULL AND joined_at < datetime('now', '-1 day')").run();
  } catch (e) {
    console.warn('[CLEANUP] gagal:', e.message);
  }
}, 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`\nSignaling server berjalan di http://localhost:${PORT}`);
  console.log(`Buka URL di browser untuk memulai video call.\n`);
});
