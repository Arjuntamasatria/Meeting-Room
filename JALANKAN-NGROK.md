# 🌐 Menjalankan Video Call Lintas Jaringan via ngrok (Windows)

**Kelompok 3 | Jaringan Multimedia | Universitas Udayana 2026**

Satu tunnel ngrok cukup untuk SELURUH aplikasi (file client + signaling Socket.IO),
karena semuanya dilayani Node.js di **satu port (3000)**.

---

## 1. Sekali saja: pasang kredensial TURN gratis (Metered.ca)

Agar koneksi tetap berhasil di jaringan ketat (data seluler / WiFi kampus):

1. Daftar gratis di **https://dashboard.metered.ca** (kuota 50 GB/bulan).
2. Buka menu **TURN Server** → salin **username** dan **credential**.
3. Tempel ke [webrtc-client.js](webrtc-client.js) bagian `TURN_CREDENTIALS`
   (mengganti `PASTE_USERNAME_METERED_DISINI` dan `PASTE_CREDENTIAL_METERED_DISINI`).

> Boleh dilewati untuk uji coba cepat — koneksi tetap jalan via STUN Google,
> tapi bisa gagal di jaringan dengan NAT ketat.

---

## 2. Pasang ngrok (sekali saja)

1. Download di **https://ngrok.com/download** → ekstrak `ngrok.exe`.
2. Daftar akun gratis, salin **authtoken** dari dashboard ngrok.
3. Di PowerShell:
   ```powershell
   ngrok config add-authtoken TOKEN_ANDA
   ```

---

## 3. Jalankan (tiap kali ingin call)

**Terminal 1 — server aplikasi:**
```powershell
cd "C:\...\Project Jaringan"
npm start
```
Tunggu sampai muncul: `Signaling server berjalan di http://localhost:3000`

**Terminal 2 — tunnel ngrok:**
```powershell
ngrok http 3000
```
Akan muncul baris **Forwarding**, contoh:
```
Forwarding   https://abcd-1234.ngrok-free.app -> http://localhost:3000
```
Salin URL `https://...ngrok-free.app` itu — inilah alamat publik aplikasi.

---

## 4. Alur Testing (2 device, 2 jaringan berbeda)

```
Device A (jaringan 1)                    Device B (jaringan 2)
─────────────────────                    ─────────────────────
1. Buka URL ngrok di browser
   https://abcd-1234.ngrok-free.app
   (klik "Visit Site" bila ngrok
    menampilkan halaman peringatan)
2. Izinkan kamera & mikrofon
3. "Rapat Baru" → "Mulai sekarang"
4. Salin link room, mis:
   https://abcd-1234.ngrok-free.app/?room=AB12CD
                          │
                          ├──── kirim link ke B (WA/chat) ────▶
                                                         5. Buka link di browser
                                                         6. Klik "Visit Site" bila perlu
                                                         7. Izinkan kamera & mikrofon
                                                         8. Otomatis tergabung ke room
                          ◀──── video & audio terhubung ────▶
```

Karena link memakai path relatif `?room=ID`, kode room otomatis terbawa di URL —
Device B tinggal buka link, langsung masuk room yang sama.

---

## 5. Memastikan TURN benar-benar dipakai (untuk laporan)

- **Uji paksa relay:** di [webrtc-client.js](webrtc-client.js) set
  `const FORCE_TURN_RELAY = true;` lalu ulangi call. Semua trafik dipaksa lewat TURN.
- **Bukti:** buka `chrome://webrtc-internals` saat call berlangsung → cari ICE
  candidate bertipe **relay**. Jika koneksi tetap jalan saat `relay` dipaksa,
  berarti TURN berfungsi.
- Kembalikan ke `false` untuk pemakaian normal (lebih cepat, P2P langsung).

---

## Catatan

- **Statistik jaringan** (RTT, jitter, loss, throughput, FPS) tetap terekam per
  detik ke SQLite untuk kedua peer — buka panel statistik (ikon grafik) saat call.
- ngrok gratis memberi URL acak yang **berubah tiap restart**. Bagikan ulang URL
  baru setiap kali menjalankan `ngrok http 3000`.
- Komputer yang menjalankan `npm start` + `ngrok` harus tetap menyala selama call.
