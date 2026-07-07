# Panduan Simulasi Kondisi Jaringan dengan Clumsy
**Kelompok 3 | Jaringan Multimedia | Universitas Udayana 2026**

Dokumen ini berisi panduan dan setting Clumsy 0.2 (Windows) untuk mensimulasikan lima
kondisi jaringan yang diuji dalam project ini.

---

## 1. Apa itu Clumsy?

Clumsy adalah tool Windows open-source yang mencegat paket jaringan menggunakan
WinDivert dan menerapkan degradasi buatan (packet loss, delay, duplikasi, reorder)
secara real-time. Tidak perlu instalasi driver tambahan selain .exe-nya.

**Download:** https://jagt.github.io/clumsy/  
**Versi yang digunakan:** Clumsy 0.2

---

## 2. Cara Menjalankan Clumsy

1. Jalankan Clumsy sebagai **Administrator** (klik kanan → Run as administrator).
2. Pada kolom **Filter**, masukkan filter WinDivert yang sesuai (lihat tabel di bawah).
3. Centang parameter yang ingin diaktifkan (Loss, Delay, dsb.) dan isi nilainya.
4. Klik **Start** untuk mulai, **Stop** untuk berhenti.
5. Selama Clumsy aktif, semua paket yang cocok dengan filter akan dikenai degradasi.

> **Tips:** Buka Clumsy *setelah* koneksi WebRTC sudah terbentuk agar proses signaling
> tidak ikut terganggu.

---

## 3. Filter WinDivert yang Digunakan

Karena WebRTC menggunakan UDP, filter yang digunakan adalah:

```
udp
```

Untuk lebih spesifik hanya mencegat traffic WebRTC (hindari traffic lain terganggu),
gunakan filter berbasis port TURN jika relay digunakan:

```
udp and remotePort == 3478
```

Untuk kondisi simulasi umum (semua UDP termasuk P2P langsung), gunakan:

```
udp
```

---

## 4. Lima Kondisi Jaringan

### Kondisi 1 — Normal (Baseline)

**Deskripsi:** Tidak ada degradasi. Digunakan sebagai data referensi.

| Parameter | Nilai |
|-----------|-------|
| Filter    | —     |
| Clumsy    | Tidak dijalankan |

**Langkah:**
1. Pastikan Clumsy tidak berjalan (atau sudah di-Stop).
2. Lakukan pengujian WebRTC secara langsung.
3. Catat nilai RTT, Packet Loss, Jitter, dan Throughput sebagai baseline.

---

### Kondisi 2 — Packet Loss Sedang (5%)

**Deskripsi:** Simulasi jaringan dengan 5% packet loss, mendekati kondisi Wi-Fi
penuh atau koneksi mobile yang sedikit tidak stabil.

| Parameter       | Nilai       |
|-----------------|-------------|
| Filter          | `udp`       |
| Drop: aktif     | Ya          |
| Drop: chance    | **5.00%**   |
| Inbound         | Ya          |
| Outbound        | Ya          |

**Langkah:**
1. Jalankan Clumsy sebagai Administrator.
2. Kolom Filter: `udp`
3. Centang **Drop**, isi nilai **5.00**.
4. Pastikan **Inbound** dan **Outbound** dicentang.
5. Klik **Start**.
6. Jalankan sesi WebRTC dan amati panel Network Stats.

**Ekspektasi hasil:**
- Packet Loss: ~4–6%
- Jitter: meningkat ringan (~20–40 ms)
- Video: sesekali frame freeze singkat, kualitas sedikit turun

---

### Kondisi 3 — Packet Loss Tinggi (15%)

**Deskripsi:** Simulasi jaringan dengan 15% packet loss, mendekati kondisi koneksi
buruk atau jaringan seluler di area terpencil.

| Parameter       | Nilai       |
|-----------------|-------------|
| Filter          | `udp`       |
| Drop: aktif     | Ya          |
| Drop: chance    | **15.00%**  |
| Inbound         | Ya          |
| Outbound        | Ya          |

**Langkah:**
1. Jalankan Clumsy sebagai Administrator.
2. Kolom Filter: `udp`
3. Centang **Drop**, isi nilai **15.00**.
4. Pastikan **Inbound** dan **Outbound** dicentang.
5. Klik **Start**.
6. Jalankan sesi WebRTC dan amati panel Network Stats.

**Ekspektasi hasil:**
- Packet Loss: ~13–17%
- Jitter: meningkat signifikan (~50–100 ms)
- Video: sering freeze, resolusi turun otomatis oleh adaptive bitrate WebRTC
- Audio: kemungkinan putus-putus

> **Catatan:** Pada 15% loss, mekanisme adaptive bitrate WebRTC akan aktif dan
> menurunkan resolusi/framerate secara otomatis. Ini adalah behavior yang diharapkan.

---

### Kondisi 4 — Bandwidth Terbatas (512 kbps)

**Deskripsi:** Simulasi bandwidth rendah setara koneksi DSL/4G lemah.  
Dikonfigurasi melalui **Network Throttling di Chrome DevTools**, bukan Clumsy.

**→ Lihat bagian 5 (Network Throttling) untuk panduan lengkap.**

---

### Kondisi 5 — Bandwidth Sangat Terbatas (256 kbps)

**Deskripsi:** Simulasi bandwidth sangat rendah, setara koneksi 3G atau satelit.  
Dikonfigurasi melalui **Network Throttling di Chrome DevTools**, bukan Clumsy.

**→ Lihat bagian 5 (Network Throttling) untuk panduan lengkap.**

---

## 5. Simulasi Bandwidth dengan Chrome DevTools Network Throttling

Network Throttling di Chrome membatasi bandwidth HTTP/WebSocket (termasuk signaling),
namun *tidak* membatasi UDP WebRTC secara langsung. Untuk mensimulasikan bandwidth
terbatas pada WebRTC, gunakan kombinasi berikut:

### Cara 1: Throttle via DevTools (membatasi signaling + TURN TCP relay)

1. Buka Chrome, tekan **F12** untuk membuka DevTools.
2. Pilih tab **Network**.
3. Klik dropdown **No throttling** di toolbar atas.
4. Pilih **Add...** atau **Custom** untuk membuat profil baru.

**Preset 512 kbps:**
| Field      | Nilai        |
|------------|--------------|
| Name       | `512kbps`    |
| Download   | 512 Kbps     |
| Upload     | 256 Kbps     |
| Latency    | 50 ms        |

**Preset 256 kbps:**
| Field      | Nilai        |
|------------|--------------|
| Name       | `256kbps`    |
| Download   | 256 Kbps     |
| Upload     | 128 Kbps     |
| Latency    | 100 ms       |

5. Pilih profil yang dibuat dari dropdown.
6. Refresh halaman — throttling aktif sejak halaman dimuat ulang.

### Cara 2: Kombinasi Clumsy + DevTools (lebih realistis)

Untuk simulasi bandwidth WebRTC UDP yang lebih mendekati kondisi nyata,
kombinasikan:

- **Clumsy** dengan Delay tinggi (tambah delay 200–400 ms) untuk simulasi latensi.
- **Chrome DevTools** throttle untuk membatasi signaling dan HTTP.

**Setting Clumsy untuk delay tinggi (simulasi bandwidth rendah):**

| Parameter       | Nilai 512 kbps | Nilai 256 kbps |
|-----------------|----------------|----------------|
| Filter          | `udp`          | `udp`          |
| Delay: aktif    | Ya             | Ya             |
| Delay: time     | 150 ms         | 300 ms         |
| Inbound         | Ya             | Ya             |
| Outbound        | Ya             | Ya             |

---

## 6. Menghentikan Simulasi

- **Clumsy:** Klik tombol **Stop** di UI Clumsy. Semua paket akan kembali normal.
- **DevTools:** Ubah kembali throttle ke **No throttling** di dropdown Network tab.

Pastikan simulasi dihentikan sebelum berpindah ke kondisi berikutnya agar data
tidak tercampur.

---

## 7. Tabel Ringkasan Semua Kondisi

| # | Kondisi              | Tool        | Parameter Utama              |
|---|----------------------|-------------|------------------------------|
| 1 | Normal               | —           | Tidak ada degradasi          |
| 2 | Packet Loss Sedang   | Clumsy      | Drop 5%, UDP                 |
| 3 | Packet Loss Tinggi   | Clumsy      | Drop 15%, UDP                |
| 4 | Bandwidth 512 kbps   | DevTools    | Download 512K, Upload 256K   |
| 5 | Bandwidth 256 kbps   | DevTools    | Download 256K, Upload 128K   |
