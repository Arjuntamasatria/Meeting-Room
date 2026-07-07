# Panduan Setup Infrastruktur WebRTC
**Kelompok 3 | Jaringan Multimedia | Universitas Udayana 2026**

Panduan ini mencakup setup lengkap dari awal hingga siap pengujian:  
STUN (Google), TURN (coturn), konfigurasi client, dan verifikasi koneksi.

---

## Daftar File Infrastruktur

| File                    | Deskripsi                                                    |
|-------------------------|--------------------------------------------------------------|
| `turnserver.conf`       | Konfigurasi coturn — salin dan jalankan langsung             |
| `clumsy-presets.md`     | Panduan dan setting Clumsy untuk simulasi kondisi jaringan   |
| `testing-checklist.md`  | Checklist pengujian tiga skenario jaringan                   |
| `README-infrastruktur.md` | Dokumen ini — panduan setup dari awal                      |
| `webrtc-client.js`      | Client WebRTC (sudah selesai, lihat bagian 1.4 untuk config) |

---

## 1. Setup TURN Server (coturn)

### 1.1 Instalasi coturn

**Windows:**

1. Download coturn untuk Windows dari:  
   https://github.com/coturn/coturn/releases  
   (cari file `.exe` atau `.zip` untuk Windows, pilih versi terbaru)

2. Ekstrak ke folder, misalnya `C:\coturn\`.

3. Buat folder log:
   ```
   mkdir C:\coturn\logs
   ```

4. Salin `turnserver.conf` dari project ini ke `C:\coturn\`.

5. Edit `turnserver.conf` — sesuaikan baris berikut:
   - `external-ip=` → isi IP publik mesin (jika berada di belakang NAT)
   - `log-file=C:\coturn\logs\turnserver.log`

**Linux (Ubuntu/Debian):**

```bash
sudo apt update && sudo apt install coturn -y
sudo cp turnserver.conf /etc/turnserver.conf
```

Edit `/etc/turnserver.conf` — sesuaikan `external-ip` dan `log-file=/var/log/turnserver.log`.

---

### 1.2 Menjalankan TURN Server

**Windows:**
```cmd
# Dari folder C:\coturn\, jalankan sebagai Administrator:
turnserver.exe -c turnserver.conf
```

**Linux:**
```bash
sudo turnserver -c /etc/turnserver.conf
# Atau sebagai service systemd:
sudo systemctl start coturn
sudo systemctl enable coturn
```

**Output yang diharapkan saat berhasil:**
```
0: : Listener address to use: 0.0.0.0
0: : Listener port: 3478
0: : Relay address: <IP_LOKAL>
0: : TURN server ...
0: : Total: 1 listeners, 1 relays
```

---

### 1.3 Verifikasi TURN Server

Gunakan `turnutils_uclient` yang ikut dalam paket coturn:

```bash
# Dari jaringan yang sama:
turnutils_uclient -u webrtc -W webrtcpass 127.0.0.1:3478

# Dari jaringan berbeda (ganti dengan IP publik):
turnutils_uclient -u webrtc -W webrtcpass <IP_SERVER>:3478
```

**Output berhasil:**
```
Total transmit time is ...
Total lost packets ...
Total receive time is ...
```

Jika ada error `UNAUTHORIZED`, periksa username/credential di `turnserver.conf`.

**Verifikasi firewall (pastikan port terbuka):**
- UDP 3478 — TURN/STUN
- TCP 3478 — TURN via TCP (fallback)
- UDP 49152–65535 — port relay

**Windows Firewall:**
```cmd
netsh advfirewall firewall add rule name="TURN UDP" protocol=UDP dir=in action=allow localport=3478
netsh advfirewall firewall add rule name="TURN TCP" protocol=TCP dir=in action=allow localport=3478
netsh advfirewall firewall add rule name="TURN Relay" protocol=UDP dir=in action=allow localport=49152-65535
```

---

### 1.4 Konfigurasi Client WebRTC (webrtc-client.js)

File `webrtc-client.js` sudah berisi placeholder TURN server. Ganti baris berikut
di bagian `CONFIG.ICE_SERVERS`:

```javascript
// Sebelum (placeholder):
{
  urls:       'turn:YOUR_TURN_SERVER:3478',
  username:   'webrtc',
  credential: 'webrtcpass'
}

// Sesudah (ganti YOUR_TURN_SERVER dengan IP server coturn):
{
  urls:       'turn:192.168.1.100:3478',   // contoh: IP lokal untuk skenario A/B
  username:   'webrtc',
  credential: 'webrtcpass'
}

// Atau untuk skenario internet publik:
{
  urls:       'turn:203.0.113.10:3478',    // contoh: IP publik VPS/server
  username:   'webrtc',
  credential: 'webrtcpass'
}
```

STUN Google sudah dikonfigurasi dan tidak perlu diubah:
```javascript
{ urls: 'stun:stun.l.google.com:19302' },
{ urls: 'stun:stun1.l.google.com:19302' },
```

---

## 2. STUN Server (Google)

Tidak perlu instalasi. Google STUN server tersedia gratis:
- `stun.l.google.com:19302`
- `stun1.l.google.com:19302`

Kedua server ini sudah dikonfigurasi di `webrtc-client.js` dan aktif secara default.

**Cara kerja:** Saat browser WebRTC menghubungi STUN server, server mengembalikan
IP publik dan port yang terlihat dari internet (Server Reflexive Address / `srflx`).
Informasi ini dikirim melalui signaling ke peer lain untuk memungkinkan koneksi
langsung melewati NAT.

---

## 3. Signaling Server

Signaling server (Node.js + Socket.IO) dikerjakan oleh anggota kelompok lain.
Dari sisi infrastruktur ini, yang perlu dipastikan:

- Signaling server berjalan dan dapat diakses dari semua peer
- URL signaling sudah sesuai di `webrtc-client.js`:
  ```javascript
  SIGNALING_URL: window.location.origin,
  ```
  Nilai `window.location.origin` otomatis menggunakan host yang sama dengan halaman.
  Jika server berbeda host, ubah ke URL eksplisit:
  ```javascript
  SIGNALING_URL: 'http://192.168.1.100:3000',  // contoh
  ```

---

## 4. Urutan Setup Lengkap

### Untuk Pengujian Skenario A (Satu LAN)

```
1. Jalankan signaling server di satu mesin di LAN
2. Buka index.html dari browser semua peer
   (akses via http://<IP_LOKAL_SERVER>:<PORT>/)
3. TURN tidak diperlukan untuk skenario ini
4. Peer bergabung ke room yang sama
5. Koneksi menggunakan ICE candidate "host" (langsung)
```

### Untuk Pengujian Skenario B (Antar-LAN)

```
1. Jalankan signaling server di mesin yang dapat diakses dari kedua LAN
   (port-forward atau gunakan IP publik)
2. Jalankan coturn: turnserver.exe -c turnserver.conf
3. Isi IP coturn di webrtc-client.js (baris turn:YOUR_TURN_SERVER)
4. Peer A (LAN 1) dan Peer B (LAN 2) buka halaman dari URL signaling server
5. Koneksi via ICE candidate "srflx" (STUN) atau "relay" (TURN)
```

### Untuk Pengujian Skenario C (Internet Publik)

```
1. Gunakan VPS/server dengan IP publik, atau port-forward router
2. Jalankan signaling server di VPS
3. Jalankan coturn di VPS dengan external-ip=<IP_PUBLIK_VPS>
4. Buka firewall VPS: port 3478 UDP+TCP, port 49152-65535 UDP
5. Isi IP publik VPS di webrtc-client.js
6. Peer dari ISP berbeda buka halaman lewat IP publik VPS
7. Koneksi hampir pasti via ICE candidate "relay" (TURN)
```

---

## 5. Troubleshooting Umum

### Koneksi gagal / badge tetap "Menghubungkan"

1. **Periksa signaling server** — apakah berjalan dan dapat diakses?
2. **Periksa console browser** (F12 → Console) — cari error WebSocket atau ICE.
3. **Buka `chrome://webrtc-internals`** — lihat apakah ICE candidate ditemukan.
4. **Cek firewall** — port TURN (3478) dan relay (49152–65535) harus terbuka.

### TURN tidak berfungsi

1. Jalankan `turnutils_uclient` untuk tes langsung ke coturn.
2. Pastikan `external-ip` di `turnserver.conf` diisi jika server di belakang NAT.
3. Pastikan credentials di `webrtc-client.js` sama persis dengan `turnserver.conf`:
   - username: `webrtc`
   - credential: `webrtcpass`

### ICE candidate "relay" tidak muncul di webrtc-internals

1. Pastikan URL TURN di `webrtc-client.js` dapat dijangkau dari jaringan browser.
2. Cek apakah `lt-cred-mech` aktif di `turnserver.conf`.
3. Cek log coturn untuk error autentikasi.

### Video call terputus saat Clumsy aktif di 15%

Ini adalah perilaku normal — adaptive bitrate WebRTC akan menurunkan resolusi/framerate
secara otomatis. Jika koneksi benar-benar putus (ICE failed), kurangi nilai Drop di Clumsy.

---

## 6. Referensi

| Sumber | Keterangan |
|--------|-----------|
| [WebRTC Spec](https://www.w3.org/TR/webrtc/) | Spesifikasi resmi W3C |
| [coturn Wiki](https://github.com/coturn/coturn/wiki) | Dokumentasi coturn |
| [Clumsy](https://jagt.github.io/clumsy/) | Tool simulasi jaringan Windows |
| [chrome://webrtc-internals](chrome://webrtc-internals) | Diagnostik WebRTC di Chrome |
| [RFC 5389](https://www.rfc-editor.org/rfc/rfc5389) | Protokol STUN |
| [RFC 5766](https://www.rfc-editor.org/rfc/rfc5766) | Protokol TURN |
