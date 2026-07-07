# Checklist Pengujian End-to-End WebRTC
**Kelompok 3 | Jaringan Multimedia | Universitas Udayana 2026**

Checklist ini mencakup tiga skenario topologi jaringan yang diuji, masing-masing
diulangi untuk kelima kondisi jaringan yang didefinisikan di `clumsy-presets.md`.

---

## Persiapan Sebelum Pengujian

- [ ] Signaling server (Node.js + Socket.IO) sudah berjalan
- [ ] Halaman `index.html` dapat diakses dari browser semua peer
- [ ] Verifikasi signaling server merespons dengan membuka URL di browser
- [ ] coturn berjalan (jika skenario antar-LAN atau internet publik)
  - [ ] Perintah: `turnserver -c turnserver.conf` → tidak ada error di log
- [ ] Chrome DevTools dibuka di semua browser pengujian (F12 → tab Network)
- [ ] Panel **Network Stats** di aplikasi siap (klik ikon Statistics)
- [ ] Catat waktu mulai setiap sesi untuk korelasi dengan log

---

## Skenario A — Satu LAN (Semua Peer dalam Satu Router/AP)

**Kondisi topologi:** Semua peer terhubung ke router/AP yang sama.  
**ICE candidate yang diharapkan:** `host` (koneksi langsung IP lokal, tanpa STUN/TURN).

### Persiapan Skenario A
- [ ] Semua perangkat terhubung ke jaringan Wi-Fi/LAN yang sama
- [ ] Catat IP lokal masing-masing perangkat (`ipconfig` / `ip addr`)
- [ ] Tidak perlu STUN atau TURN aktif (bisa dikomentari di webrtc-client.js untuk baseline)
- [ ] Signaling server dapat diakses melalui IP lokal dari semua perangkat

### Pengujian A — Per Kondisi Jaringan

#### A1: Normal (Baseline)
- [ ] Peer A dan Peer B bergabung ke room yang sama
- [ ] Koneksi terbentuk (badge "Terhubung")
- [ ] Video dan audio berjalan dua arah
- [ ] Verifikasi ICE candidate `host` di `chrome://webrtc-internals` (lihat bagian "Verifikasi Jalur Koneksi")
- [ ] Catat nilai: RTT ___ ms | Loss ___% | Jitter ___ ms | Throughput ___ kbps | FPS ___
- [ ] Export CSV log statistik

#### A2: Packet Loss Sedang (5%)
- [ ] Aktifkan Clumsy: Drop 5%, filter `udp`
- [ ] Ulangi pengujian video call
- [ ] Catat nilai: RTT ___ ms | Loss ___% | Jitter ___ ms | Throughput ___ kbps | FPS ___
- [ ] Amati apakah adaptive bitrate WebRTC aktif (resolusi/FPS turun)
- [ ] Export CSV log statistik
- [ ] **Stop Clumsy** sebelum kondisi berikutnya

#### A3: Packet Loss Tinggi (15%)
- [ ] Aktifkan Clumsy: Drop 15%, filter `udp`
- [ ] Ulangi pengujian video call
- [ ] Catat nilai: RTT ___ ms | Loss ___% | Jitter ___ ms | Throughput ___ kbps | FPS ___
- [ ] Amati degradasi visual (freeze, resolusi turun)
- [ ] Export CSV log statistik
- [ ] **Stop Clumsy** sebelum kondisi berikutnya

#### A4: Bandwidth Terbatas (512 kbps)
- [ ] Aktifkan throttle DevTools: preset `512kbps`
- [ ] Reload halaman, ulangi pengujian
- [ ] Catat nilai: RTT ___ ms | Loss ___% | Jitter ___ ms | Throughput ___ kbps | FPS ___
- [ ] Export CSV log statistik
- [ ] **Matikan throttle** sebelum kondisi berikutnya

#### A5: Bandwidth Sangat Terbatas (256 kbps)
- [ ] Aktifkan throttle DevTools: preset `256kbps`
- [ ] Reload halaman, ulangi pengujian
- [ ] Catat nilai: RTT ___ ms | Loss ___% | Jitter ___ ms | Throughput ___ kbps | FPS ___
- [ ] Export CSV log statistik
- [ ] **Matikan throttle**

---

## Skenario B — Antar-LAN (Peer di Jaringan Berbeda, STUN Diperlukan)

**Kondisi topologi:** Peer A di jaringan LAN/Wi-Fi rumah/kantor A, Peer B di LAN lain
(misalnya hotspot HP atau koneksi Wi-Fi berbeda).  
**ICE candidate yang diharapkan:** `srflx` (Server Reflexive via STUN) atau `relay` (TURN).

### Persiapan Skenario B
- [ ] Peer A dan Peer B berada di subnet/router yang berbeda
- [ ] Konfirmasi konfigurasi STUN di `webrtc-client.js` aktif:
  ```javascript
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
  ```
- [ ] coturn berjalan di mesin yang dapat diakses dari kedua jaringan
- [ ] Kredensial TURN di `webrtc-client.js` sesuai dengan `turnserver.conf`
- [ ] Signaling server dapat diakses dari kedua jaringan (IP publik atau port-forwarded)
- [ ] Buka port 3478 UDP+TCP di firewall/router untuk coturn
- [ ] Tes akses TURN: `turnutils_uclient -u webrtc -W webrtcpass <IP_TURN>:3478`

### Pengujian B — Per Kondisi Jaringan

#### B1: Normal (Baseline)
- [ ] Peer A dan Peer B bergabung ke room yang sama
- [ ] Koneksi terbentuk (badge "Terhubung")
- [ ] Video dan audio berjalan dua arah
- [ ] Verifikasi tipe ICE candidate di `chrome://webrtc-internals`:
  - [ ] Apakah `srflx` (STUN berhasil)?
  - [ ] Apakah `relay` (TURN digunakan karena STUN gagal)?
- [ ] Catat nilai: RTT ___ ms | Loss ___% | Jitter ___ ms | Throughput ___ kbps | FPS ___
- [ ] Export CSV log statistik

#### B2: Packet Loss Sedang (5%)
- [ ] Aktifkan Clumsy: Drop 5%, filter `udp`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Stop Clumsy

#### B3: Packet Loss Tinggi (15%)
- [ ] Aktifkan Clumsy: Drop 15%, filter `udp`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Stop Clumsy

#### B4: Bandwidth Terbatas (512 kbps)
- [ ] Aktifkan throttle DevTools: `512kbps`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Matikan throttle

#### B5: Bandwidth Sangat Terbatas (256 kbps)
- [ ] Aktifkan throttle DevTools: `256kbps`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Matikan throttle

---

## Skenario C — Internet Publik (ISP Berbeda, TURN Hampir Pasti Diperlukan)

**Kondisi topologi:** Peer A dan Peer B terhubung melalui ISP yang berbeda (misalnya
satu menggunakan IndiHome, satu menggunakan Telkomsel/Biznet).  
**ICE candidate yang diharapkan:** `relay` (TURN wajib karena NAT simetris antar-ISP).

### Persiapan Skenario C
- [ ] Konfirmasi Peer A dan Peer B menggunakan ISP berbeda
- [ ] coturn dapat diakses dari internet publik (hosting/VPS atau port-forwarded)
- [ ] IP publik coturn sudah diisi di `turnserver.conf` → `external-ip=<IP_PUBLIK>`
- [ ] Signaling server dapat diakses dari internet publik
- [ ] Konfigurasi TURN di `webrtc-client.js` sudah diisi IP publik:
  ```javascript
  {
    urls:       'turn:<IP_PUBLIK_COTURN>:3478',
    username:   'webrtc',
    credential: 'webrtcpass'
  }
  ```
- [ ] Test koneksi TURN dari jaringan eksternal sebelum mulai sesi

### Pengujian C — Per Kondisi Jaringan

#### C1: Normal (Baseline)
- [ ] Peer A dan Peer B bergabung dari jaringan ISP berbeda
- [ ] Koneksi terbentuk
- [ ] Verifikasi di `chrome://webrtc-internals` bahwa kandidat `relay` digunakan
- [ ] Catat nilai: RTT ___ ms | Loss ___% | Jitter ___ ms | Throughput ___ kbps | FPS ___
- [ ] Export CSV log statistik

#### C2: Packet Loss Sedang (5%)
- [ ] Aktifkan Clumsy: Drop 5%, filter `udp`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Stop Clumsy

#### C3: Packet Loss Tinggi (15%)
- [ ] Aktifkan Clumsy: Drop 15%, filter `udp`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Stop Clumsy

#### C4: Bandwidth Terbatas (512 kbps)
- [ ] Aktifkan throttle DevTools: `512kbps`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Matikan throttle

#### C5: Bandwidth Sangat Terbatas (256 kbps)
- [ ] Aktifkan throttle DevTools: `256kbps`
- [ ] Ulangi pengujian, catat nilai
- [ ] Export CSV | Matikan throttle

---

## Verifikasi Jalur Koneksi via chrome://webrtc-internals

`chrome://webrtc-internals` menampilkan detail lengkap negosiasi ICE secara real-time.

### Langkah akses:

1. Di browser yang menjalankan aplikasi WebRTC, buka tab baru.
2. Ketik di address bar: `chrome://webrtc-internals` lalu tekan Enter.
3. Halaman ini otomatis mendeteksi semua `RTCPeerConnection` yang aktif.
4. Klik **RTCPeerConnection** untuk expand.

### Yang perlu diperiksa:

#### 1. Tipe ICE Candidate yang Digunakan

Cari bagian **ICE candidate grid** atau section **Stats Tables → candidate-pair**.

| Tipe Candidate | Artinya                                               | Skenario        |
|----------------|-------------------------------------------------------|-----------------|
| `host`         | Koneksi langsung IP lokal, tanpa STUN/TURN            | Satu LAN        |
| `srflx`        | Server Reflexive — IP publik ditemukan via STUN       | Antar-LAN       |
| `relay`        | Relay via TURN — NAT simetris atau firewall memblokir | Internet Publik |

#### 2. Cara Membaca Kandidat di webrtc-internals

Cari event log dengan format:
```
addIceCandidateSuccess: candidate:... typ host ...
addIceCandidateSuccess: candidate:... typ srflx raddr ...
addIceCandidateSuccess: candidate:... typ relay raddr ...
```

Kandidat yang digunakan untuk koneksi aktif ditandai dengan `selected=true`
atau terlihat di bagian **Stats → candidate-pair** dengan `state: succeeded`.

#### 3. Checklist Verifikasi Kandidat

- [ ] **Skenario A:** Terlihat `typ host` pada pair yang succeeded
- [ ] **Skenario B:** Terlihat `typ srflx` atau `typ relay` pada pair yang succeeded
- [ ] **Skenario C:** Terlihat `typ relay` pada pair yang succeeded

#### 4. Membaca Grafik Stats Real-time

webrtc-internals juga menampilkan grafik:
- `googRtt` atau `currentRoundTripTime` → RTT
- `packetsLost` → packet loss kumulatif
- `jitterBufferDelay` / `jitter` → jitter
- `bytesSent` / `bytesReceived` → throughput

Nilai ini konsisten dengan yang ditampilkan di panel Network Stats aplikasi.

---

## Tabel Rekap Hasil Pengujian

Isi tabel ini setelah semua pengujian selesai.

| Skenario | Kondisi             | RTT (ms) | Loss (%) | Jitter (ms) | Throughput (kbps) | FPS | Kandidat ICE |
|----------|---------------------|----------|----------|-------------|-------------------|-----|--------------|
| A        | Normal              |          |          |             |                   |     | host         |
| A        | Loss 5%             |          |          |             |                   |     | host         |
| A        | Loss 15%            |          |          |             |                   |     | host         |
| A        | BW 512 kbps         |          |          |             |                   |     | host         |
| A        | BW 256 kbps         |          |          |             |                   |     | host         |
| B        | Normal              |          |          |             |                   |     | srflx/relay  |
| B        | Loss 5%             |          |          |             |                   |     | srflx/relay  |
| B        | Loss 15%            |          |          |             |                   |     | srflx/relay  |
| B        | BW 512 kbps         |          |          |             |                   |     | srflx/relay  |
| B        | BW 256 kbps         |          |          |             |                   |     | srflx/relay  |
| C        | Normal              |          |          |             |                   |     | relay        |
| C        | Loss 5%             |          |          |             |                   |     | relay        |
| C        | Loss 15%            |          |          |             |                   |     | relay        |
| C        | BW 512 kbps         |          |          |             |                   |     | relay        |
| C        | BW 256 kbps         |          |          |             |                   |     | relay        |
