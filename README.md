# Meeting-Room

Aplikasi **video call berbasis WebRTC** dengan signaling server Node.js + Socket.IO.
Dibuat oleh **Kelompok 3 — Jaringan Multimedia, Universitas Udayana**.

## Fitur

- **Video call P2P (mesh)** antar peserta via WebRTC, dengan STUN/TURN untuk menembus NAT.
- **Buat room instan** atau **jadwalkan meeting** (dengan tombol tambah ke Google Calendar).
- **Validasi room** — hanya room yang benar-benar dibuat yang bisa di-join.
- **Autentikasi** (sign up / login) opsional; meeting terjadwal milik akun hanya bisa dihapus pemiliknya.
- **Chat teks** dalam room.
- **Lobby/preview** kamera & mikrofon sebelum bergabung, dengan kontrol on/off.
- **Statistik jaringan real-time** (RTT, jitter, packet loss, throughput, FPS, resolusi) + **ekspor CSV**.

## Teknologi

- **Server:** Node.js, Express, Socket.IO
- **Database:** SQLite (`node:sqlite` bawaan Node.js ≥ 22.5.0)
- **Client:** HTML, CSS, JavaScript (WebRTC API), tanpa framework
- **Analisis:** Python (pandas, matplotlib) — lihat `analisis.py`

## Menjalankan

Butuh **Node.js versi 22.5.0 atau lebih baru**.

```bash
npm install
npm start
```

Lalu buka `http://localhost:3000` di browser.

Untuk uji coba lintas jaringan (berbeda WiFi/seluler), gunakan ngrok —
panduan lengkap ada di [JALANKAN-NGROK.md](JALANKAN-NGROK.md).

## Struktur

| File | Keterangan |
|------|------------|
| `server.js` | Signaling server + REST API auth + Socket.IO |
| `database.js` | Skema & koneksi SQLite |
| `index.html` / `style.css` | Antarmuka aplikasi |
| `webrtc-client.js` | Logika WebRTC, room, chat, statistik, ekspor CSV |
| `auth-client.js` | Sign up / login sisi klien |
| `analisis.py` | Analisis statistik jaringan dari database |
| `turnserver.conf` | Contoh konfigurasi TURN server (coturn) |
