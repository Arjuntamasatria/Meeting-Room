"""
analisis.py — Analisis Data WebRTC
Kelompok 3 | Jaringan Multimedia | Universitas Udayana 2026

Kebutuhan:
    pip install pandas matplotlib

Opsional (untuk MOS/PESQ):
    pip install pesq numpy scipy
"""

import sqlite3
import os
import sys
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
from datetime import datetime

# ── Konfigurasi ───────────────────────────────────────────────────────────────
DB_PATH     = os.path.join(os.path.dirname(__file__), 'webrtc_app.db')
OUTPUT_DIR  = os.path.join(os.path.dirname(__file__), 'analisis_output')
os.makedirs(OUTPUT_DIR, exist_ok=True)

KONDISI_LABEL = {
    'normal':     'Normal',
    'loss5':      'Packet Loss 5%',
    'loss15':     'Packet Loss 15%',
    'bw512':      'Bandwidth 512 kbps',
    'bw256':      'Bandwidth 256 kbps',
}

# ── Koneksi Database ──────────────────────────────────────────────────────────
def connect_db():
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] File database tidak ditemukan: {DB_PATH}")
        print("Pastikan aplikasi WebRTC sudah dijalankan dan ada data statistik.")
        sys.exit(1)
    return sqlite3.connect(DB_PATH)


# ── Baca Data ─────────────────────────────────────────────────────────────────
def load_network_stats(conn):
    df = pd.read_sql_query(
        "SELECT * FROM network_stats ORDER BY timestamp ASC",
        conn
    )
    if df.empty:
        print("[PERINGATAN] Tabel network_stats kosong. Jalankan sesi call terlebih dahulu.")
        return df

    df['timestamp'] = pd.to_datetime(df['timestamp'])
    return df


def load_sessions(conn):
    return pd.read_sql_query("SELECT * FROM sessions ORDER BY joined_at ASC", conn)


def load_meetings(conn):
    return pd.read_sql_query("SELECT * FROM meetings ORDER BY scheduled_at ASC", conn)


# ── Agregasi per Room ─────────────────────────────────────────────────────────
def aggregate_by_room(df):
    if df.empty:
        return pd.DataFrame()

    agg = df.groupby('room_id').agg(
        avg_rtt_ms       = ('rtt_ms',       'mean'),
        avg_jitter_ms    = ('jitter_ms',     'mean'),
        avg_packet_loss  = ('packet_loss',   'mean'),
        avg_bitrate_kbps = ('bitrate_kbps',  'mean'),
        avg_fps          = ('fps',           'mean'),
        min_rtt_ms       = ('rtt_ms',        'min'),
        max_rtt_ms       = ('rtt_ms',        'max'),
        min_packet_loss  = ('packet_loss',   'min'),
        max_packet_loss  = ('packet_loss',   'max'),
        samples          = ('rtt_ms',        'count'),
    ).reset_index()

    return agg


# ── Grafik Batang: Perbandingan Parameter per Room ───────────────────────────
def plot_bar_comparison(agg):
    if agg.empty:
        print("[SKIP] Tidak ada data untuk grafik batang.")
        return

    rooms = agg['room_id'].tolist()
    x     = range(len(rooms))
    room_labels = [r[:8] for r in rooms]  # potong jika terlalu panjang

    fig, axes = plt.subplots(2, 3, figsize=(14, 8))
    fig.suptitle('Perbandingan Parameter Jaringan per Room', fontsize=14, fontweight='bold', y=1.01)

    params = [
        ('avg_rtt_ms',       'RTT Rata-rata (ms)',          '#1a73e8', 150),
        ('avg_jitter_ms',    'Jitter Rata-rata (ms)',        '#fbbc04', 30),
        ('avg_packet_loss',  'Packet Loss Rata-rata (%)',    '#ea4335', 1),
        ('avg_bitrate_kbps', 'Throughput Rata-rata (kbps)', '#34a853', 500),
        ('avg_fps',          'FPS Rata-rata',                '#9c27b0', 24),
    ]

    for idx, (col, title, color, threshold) in enumerate(params):
        ax = axes[idx // 3][idx % 3]
        values = agg[col].fillna(0).tolist()
        bars   = ax.bar(x, values, color=color, alpha=0.82, width=0.6, edgecolor='white')
        ax.axhline(threshold, color='gray', linestyle='--', linewidth=0.8, alpha=0.7,
                   label=f'Target: {threshold}')
        ax.set_title(title, fontsize=11, fontweight='500')
        ax.set_xticks(list(x))
        ax.set_xticklabels(room_labels, fontsize=9, rotation=20, ha='right')
        ax.yaxis.set_major_formatter(ticker.FormatStrFormatter('%.1f'))
        ax.legend(fontsize=8)
        ax.grid(axis='y', alpha=0.3)
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                    f'{val:.1f}', ha='center', va='bottom', fontsize=8)

    # sembunyikan panel keenam yang kosong
    axes[1][2].set_visible(False)

    plt.tight_layout()
    out = os.path.join(OUTPUT_DIR, 'bar_perbandingan_parameter.png')
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"[OK] Grafik batang disimpan: {out}")


# ── Grafik Time Series: RTT dan Jitter per Room ───────────────────────────────
def plot_time_series(df):
    if df.empty:
        print("[SKIP] Tidak ada data untuk grafik time series.")
        return

    rooms = df['room_id'].unique()
    for room_id in rooms:
        sub = df[df['room_id'] == room_id].copy()
        sub = sub.sort_values('timestamp')

        # Konversi timestamp ke detik relatif dari awal sesi
        t0 = sub['timestamp'].min()
        sub['elapsed_s'] = (sub['timestamp'] - t0).dt.total_seconds()

        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 7), sharex=True)
        fig.suptitle(f'Time Series — Room: {room_id[:8]}', fontsize=13, fontweight='bold')

        # RTT
        ax1.plot(sub['elapsed_s'], sub['rtt_ms'], color='#1a73e8', linewidth=1.4,
                 label='RTT (ms)')
        ax1.axhline(150, color='#fbbc04', linestyle='--', linewidth=0.9, label='Target 150 ms')
        ax1.set_ylabel('RTT (ms)', fontsize=10)
        ax1.legend(fontsize=9)
        ax1.grid(alpha=0.3)
        ax1.fill_between(sub['elapsed_s'], sub['rtt_ms'], alpha=0.08, color='#1a73e8')

        # Jitter
        ax2.plot(sub['elapsed_s'], sub['jitter_ms'], color='#ea4335', linewidth=1.4,
                 label='Jitter (ms)')
        ax2.axhline(30, color='#fbbc04', linestyle='--', linewidth=0.9, label='Target 30 ms')
        ax2.set_xlabel('Waktu (detik)', fontsize=10)
        ax2.set_ylabel('Jitter (ms)', fontsize=10)
        ax2.legend(fontsize=9)
        ax2.grid(alpha=0.3)
        ax2.fill_between(sub['elapsed_s'], sub['jitter_ms'], alpha=0.08, color='#ea4335')

        plt.tight_layout()
        safe_id = room_id.replace('/', '_')
        out = os.path.join(OUTPUT_DIR, f'timeseries_{safe_id}.png')
        plt.savefig(out, dpi=150, bbox_inches='tight')
        plt.close()
        print(f"[OK] Grafik time series disimpan: {out}")


# ── Tabel Ringkasan ───────────────────────────────────────────────────────────
def print_summary_table(agg):
    if agg.empty:
        print("\n[SKIP] Tidak ada data untuk tabel ringkasan.")
        return

    print("\n" + "═" * 80)
    print("  TABEL RINGKASAN STATISTIK JARINGAN")
    print("═" * 80)
    cols = ['room_id', 'samples', 'avg_rtt_ms', 'min_rtt_ms', 'max_rtt_ms',
            'avg_jitter_ms', 'avg_packet_loss', 'avg_bitrate_kbps', 'avg_fps']
    sub  = agg[cols].copy()
    sub.columns = ['Room ID', 'Samples', 'RTT Avg', 'RTT Min', 'RTT Max',
                   'Jitter Avg', 'Loss Avg %', 'Bitrate Avg', 'FPS Avg']
    sub['Room ID'] = sub['Room ID'].str[:10]
    float_cols = ['RTT Avg', 'RTT Min', 'RTT Max', 'Jitter Avg', 'Loss Avg %', 'Bitrate Avg', 'FPS Avg']
    for c in float_cols:
        sub[c] = sub[c].map(lambda v: f'{v:.2f}' if pd.notna(v) else '—')
    print(sub.to_string(index=False))
    print("═" * 80)

    csv_path = os.path.join(OUTPUT_DIR, 'ringkasan_statistik.csv')
    sub.to_csv(csv_path, index=False)
    print(f"[OK] Tabel disimpan ke: {csv_path}")


# ── Evaluasi MOS (opsional) ───────────────────────────────────────────────────
def evaluate_mos():
    try:
        import numpy as np
        from pesq import pesq as pesq_score
        from scipy.io import wavfile

        ref_path = os.path.join(os.path.dirname(__file__), 'ref_audio.wav')
        deg_path = os.path.join(os.path.dirname(__file__), 'deg_audio.wav')

        if not os.path.exists(ref_path) or not os.path.exists(deg_path):
            print("\n[SKIP] MOS/PESQ: file ref_audio.wav / deg_audio.wav tidak ditemukan.")
            print("       Letakkan kedua file WAV (16 kHz, mono) di folder project untuk evaluasi MOS.")
            return

        rate_ref, ref = wavfile.read(ref_path)
        rate_deg, deg = wavfile.read(deg_path)

        if rate_ref != rate_deg:
            print("[ERROR] Sample rate ref dan deg harus sama.")
            return

        # Potong agar panjang sama
        min_len = min(len(ref), len(deg))
        ref = ref[:min_len].astype(np.float32)
        deg = deg[:min_len].astype(np.float32)

        # Normalisasi
        ref /= np.max(np.abs(ref)) + 1e-9
        deg /= np.max(np.abs(deg)) + 1e-9

        mode = 'wb' if rate_ref == 16000 else 'nb'
        mos  = pesq_score(rate_ref, ref, deg, mode)

        print("\n" + "═" * 40)
        print("  SKOR MOS (ITU-T P.862 / PESQ)")
        print("═" * 40)
        print(f"  MOS : {mos:.3f}")
        grade = (
            'Excellent (≥ 4.5)' if mos >= 4.5 else
            'Good (4.0–4.4)'    if mos >= 4.0 else
            'Fair (3.5–3.9)'    if mos >= 3.5 else
            'Poor (3.0–3.4)'    if mos >= 3.0 else
            'Bad (< 3.0)'
        )
        print(f"  Grade: {grade}")
        print("═" * 40)

        result_path = os.path.join(OUTPUT_DIR, 'mos_result.txt')
        with open(result_path, 'w') as f:
            f.write(f"Tanggal analisis : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Skor MOS (PESQ)  : {mos:.3f}\n")
            f.write(f"Grade            : {grade}\n")
        print(f"[OK] Hasil MOS disimpan ke: {result_path}")

    except ImportError:
        print("\n[SKIP] MOS/PESQ: library 'pesq' tidak terinstal.")
        print("       Install dengan: pip install pesq")
    except Exception as e:
        print(f"\n[ERROR] Evaluasi MOS gagal: {e}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  Analisis Data WebRTC — Kelompok 3 Jarmul 2026")
    print(f"  Database : {DB_PATH}")
    print(f"  Output   : {OUTPUT_DIR}")
    print("=" * 60)

    conn = connect_db()

    df_stats   = load_network_stats(conn)
    df_sessions = load_sessions(conn)
    df_meetings = load_meetings(conn)

    print(f"\n[INFO] network_stats : {len(df_stats)} baris")
    print(f"[INFO] sessions      : {len(df_sessions)} baris")
    print(f"[INFO] meetings      : {len(df_meetings)} baris")

    if df_stats.empty:
        conn.close()
        return

    agg = aggregate_by_room(df_stats)

    plot_bar_comparison(agg)
    plot_time_series(df_stats)
    print_summary_table(agg)
    evaluate_mos()

    conn.close()
    print(f"\n[SELESAI] Semua output tersimpan di folder: {OUTPUT_DIR}/")


if __name__ == '__main__':
    main()
