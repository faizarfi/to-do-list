# RuangKerja — Personal Productivity Toolbox

**RuangKerja** adalah aplikasi produktivitas serba guna dengan **100 alat produktivitas nyata** dalam 8 kategori yang menggabungkan antarmuka modern **Next.js (App Router + TypeScript + Tailwind CSS)** dan backend pemrosesan file lokal berkinerja tinggi **Python FastAPI**.

> **Status saat ini:** **100 Fitur Aktif & Terverifikasi** — Seluruh **100 fitur produktivitas** (20 PDF & Dokumen, 18 Image Tools, 14 Excel & Data, 14 Calculator & Converter, 12 Productivity Tools, 12 Developer & API Tools, 5 Keamanan & Utilitas, 5 Bisnis & Keuangan), Dashboard, Command Palette (`Ctrl+K`), Global Pomodoro Timer lintas halaman, Backup & Restore JSON, serta Dark/Light Mode siap dijalankan secara lokal.

---

## Ringkasan 100 Fitur Produktivitas (8 Kategori)

1. **PDF & Document Tools (#1–#15, #51–#55 — 20 Tools):** JPG/PNG ke PDF, Image to PDF, PDF to JPG, PDF to PNG, Merge PDF, Split PDF, Compress PDF, Rotate PDF, Reorder PDF (drag-and-drop), Delete PDF Pages, Extract PDF Pages, Watermark PDF (teks/gambar), Page Number PDF, Resize PDF, OCR PDF (Tesseract), Extract Text PDF, Protect PDF (AES-256), Unlock PDF (dengan password sah), PDF Metadata Editor, dan Markdown to PDF.
2. **Image Tools (#16–#27, #56–#61 — 18 Tools):** Image Converter (JPG/PNG/WEBP/TIFF), Image Compressor, Image Resizer, Bulk Image Resize, Image Cropper (drag interaktif), Image Rotate & Flip, DPI Changer, Passport Photo Maker (2×3, 3×4, 4×6 + lembar cetak), Bulk Rename, Image Watermark, Image Collage, Image Information, Filter & Penyesuaian Gambar, Sudut Bulat & Bingkai, Generator Pack Favicon + `site.webmanifest`, Resizer Sosial Media Preset, Ekstraktor Palet Warna Dominan, dan Hapus Metadata EXIF.
3. **Excel & Data Tools (#28–#36, #62–#66 — 14 Tools):** Excel Viewer (`.xlsx`/`.xls`/`.csv`), Excel to CSV, CSV to Excel, Merge Excel, Merge CSV, Remove Duplicate, Split Excel per Sheet, Data Cleaner, Excel to PDF Report, JSON to Excel/CSV, Excel/CSV to JSON, Cari & Ganti Massal (Find & Replace), Gabung / Pecah Kolom, dan Ringkasan Statistik Kolom.
4. **Calculator & Converter Tools (#37–#45, #67–#71 — 14 Tools):** Basic Calculator, Scientific Calculator, Percentage Calculator, Date Calculator, Time Calculator, Unit Converter, File Size Converter, Image Ratio Calculator, Number Base Converter, Kalkulator Usia & Masa Kerja, Kalkulator Bandwidth & Waktu Unduh, Konverter Tipografi CSS (`px`/`rem`/`em`/`pt`/`%`), Kalkulator Proporsi Rasio, dan Kalkulator BMI & Kalori (TDEE).
5. **Productivity Tools (#46–#50, #72–#78 — 12 Tools):** Daily To-Do List + Ekspor CSV, Pomodoro Timer Global Lintas Halaman, Work Log + Ekspor CSV, Text Formatter, QR Code Generator (teks/URL/telepon/email/Wi-Fi, PNG & SVG), Markdown Notes + Ekspor PDF, Generator Notulen Rapat (MoM), Pembuat Invoice PDF Profesional, Generator Barcode (Code 128, EAN-13, EAN-8), Stopwatch & Countdown Timer, Pembanding Teks (Diff Checker), dan Analisis Frekuensi Kata.
6. **Developer & API Tools (#79–#90 — 12 Tools):** JSON Formatter & Validator, JWT Decoder, RegExp Tester, Base64 Encoder/Decoder, URL Encoder & Query Parser, Unix Timestamp Converter, Konverter Warna & Kontras WCAG 2.1, SQL Formatter, HTML/XML Formatter & Escape, CSS Box Shadow & Radius Studio, YAML ↔ JSON Converter (FastAPI PyYAML), dan Cron Expression Parser.
7. **Keamanan & Utilitas (#91–#95 — 5 Tools):** Password Generator & Strength Checker, Verifikasi Hash File (MD5, SHA-1, SHA-256, SHA-512 di FastAPI), UUID v4 / NanoID / ULID Generator, Generator Signature HMAC Web Crypto, dan Penyamar Data Sensitif (Email/HP/NIK).
8. **Bisnis & Keuangan (#96–#100 — 5 Tools):** Kalkulator Margin & Laba Usaha, Simulator Cicilan Pinjaman & KPR (Anuitas/Flat + CSV), Kalkulator Pajak PPN & PPh Indonesia, Kalkulator Titik Impas (BEP), dan Pembagi Tagihan Patungan.

---

## Arsitektur & Struktur Proyek

```text
.
├── frontend/                   # Next.js App Router + TypeScript + Tailwind CSS
│   ├── app/
│   │   ├── dashboard/          # Dashboard utama RuangKerja
│   │   ├── pdf/                # Workspace PDF & Dokumen (20 tools)
│   │   ├── image/              # Workspace Image Tools (18 tools)
│   │   ├── excel/              # Workspace Excel & Data (14 tools)
│   │   ├── calculator/         # Workspace Calculator & Converter (14 tools)
│   │   ├── productivity/       # Workspace Productivity Tools (12 tools)
│   │   ├── developer/          # Workspace Developer & API Tools (12 tools)
│   │   ├── security/           # Workspace Keamanan & Utilitas (5 tools)
│   │   ├── business/           # Workspace Bisnis & Keuangan (5 tools)
│   │   └── settings/           # Pengaturan profil, tema, backup/restore JSON, & diagnostik backend
│   ├── components/             # Komponen UI reusable (shadcn/ui style, workspace, layout, dashboard)
│   ├── hooks/                  # React hooks (useBackendHealth, useMounted)
│   ├── lib/                    # Registry 100 tools, API clients, kalkulator, Zustand localStorage store
│   ├── types/                  # Definisi tipe TypeScript
│   └── tests/                  # Unit test Vitest
├── backend/                    # Python FastAPI untuk pemrosesan file lokal
│   ├── app/
│   │   ├── api/                # Router & endpoint REST API (/api/health, /api/pdf, /api/images, /api/spreadsheets, /api/calculator, /api/qr, /api/utility)
│   │   ├── core/               # Konfigurasi, logging, & exception handlers
│   │   ├── schemas/            # Skema Pydantic
│   │   ├── services/           # Logika pemrosesan per kategori (PDF, gambar, Excel/CSV, kalkulator, QR, utility, health)
│   │   ├── utils/              # Keamanan upload, sanitasi nama file, isolasi temp, ZIP packaging
│   │   └── main.py             # Entrypoint FastAPI + lifecycle pembersihan temp
│   ├── temp/                   # Direktori sementara terisolasi per job ID
│   ├── tests/                  # Unit & API test Pytest
│   └── requirements.txt        # Daftar library Python (termasuk PyMuPDF, pypdf, Pillow, openpyxl, xlrd, pandas, qrcode, PyYAML)
├── .env.example                # Template environment variables
├── package.json                # Script pemicu bersamaan (concurrently)
└── README.md                   # Panduan instalasi & penggunaan
```

---

## 1. Persyaratan Sistem

Sebelum memulai, pastikan komputer Anda sudah memiliki:

1. **Node.js** versi **18.18+** atau **20+/22+/24+** (disertai `npm`).
   - Cek dengan perintah: `node --version` dan `npm --version`
2. **Python** versi **3.11** atau **3.12+** (disertai `pip` dan `venv`).
   - Cek dengan perintah: `python --version`
3. *(Opsional untuk OCR PDF #15)* **Tesseract OCR**:
   - **Windows**: Unduh installer dari [UB-Mannheim Tesseract](https://github.com/UB-Mannheim/tesseract/wiki) lalu tambahkan ke `PATH` atau isi path lengkapnya di `RUANGKERJA_TESSERACT_CMD`.
   - **macOS**: `brew install tesseract tesseract-lang`
   - **Ubuntu/Debian**: `sudo apt install tesseract-ocr tesseract-ocr-ind`

---

## 2. Pengaturan Environment Variables

Salin file template environment sebelum menjalankan aplikasi:

### Windows (PowerShell)
```powershell
Copy-Item .env.example frontend\.env.local
Copy-Item .env.example backend\.env
```

### macOS / Linux (Bash)
```bash
cp .env.example frontend/.env.local
cp .env.example backend/.env
```

> **Catatan Keamanan:** Jangan pernah menyimpan password, API key, atau secret asli di file `.env.example` maupun ke dalam repository Git.

---

## 3. Cara Instalasi

### A. Setup Backend (Python FastAPI)

1. Masuk ke folder `backend`:
   ```bash
   cd backend
   ```
2. Buat virtual environment Python:
   ```bash
   python -m venv .venv
   ```
3. Aktifkan virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
   - **Windows (CMD)**:
     ```cmd
     .\.venv\Scripts\activate.bat
     ```
   - **macOS / Linux**:
     ```bash
     source .venv/bin/activate
     ```
4. Instal seluruh dependency Python (gunakan `python -m pip` agar aman dari kebijakan eksekusi Windows):
   ```bash
   python -m pip install --upgrade pip
   python -m pip install -r requirements.txt
   ```

### B. Setup Frontend (Next.js)

1. Masuk ke folder `frontend` (dari root proyek):
   ```bash
   cd frontend
   npm install
   ```
2. *(Opsional untuk menjalankan backend + frontend bersamaan dari root)* instal dependency root:
   ```bash
   cd ..
   npm install
   ```

---

## 4. Cara Menjalankan Aplikasi

### Opsi 1: Menjalankan Backend & Frontend Secara Bersamaan (Direkomendasikan)
Dari folder root (`d:\todolist`):
```bash
npm run dev
```
Perintah ini menjalankan FastAPI di `http://127.0.0.1:8000` dan Next.js di `http://localhost:3000`.

### Opsi 2: Menjalankan Secara Terpisah (2 Terminal)

**Terminal 1 — Jalankan Backend FastAPI:**
```bash
cd backend
# Windows:
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
# macOS / Linux:
./.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
- Dokumentasi interaktif Swagger API: `http://127.0.0.1:8000/docs`
- Health check API: `http://127.0.0.1:8000/api/health`

**Terminal 2 — Jalankan Frontend Next.js:**
```bash
cd frontend
npm run dev
```
- Buka aplikasi di browser: `http://localhost:3000`

---

## 5. Cara Menjalankan Pengujian (Tests)

### Tes Backend (Pytest)
```bash
cd backend
# Windows:
.\.venv\Scripts\python.exe -m pytest -v
# macOS / Linux:
./.venv/bin/python -m pytest -v
```

### Tes Frontend (Vitest, Typecheck, Lint, Build)
```bash
cd frontend
npm test
npm run typecheck
npm run lint
npm run build
```

---

## 6. Mengatasi Error Umum

1. **`Program 'pip.exe' failed to run` atau terblokir di Windows PowerShell:**
   - Gunakan `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` alih-alih memanggil `pip.exe` langsung.
2. **PowerShell menolak `Activate.ps1` (`ExecutionPolicy`):**
   - Jalankan tanpa aktivasi dengan memanggil Python di dalam venv secara langsung: `.\.venv\Scripts\python.exe -m uvicorn ...`
3. **Frontend menampilkan "Backend Offline" pada status sidebar / Pengaturan:**
   - Pastikan server FastAPI sudah berjalan di port `8000`.
   - Periksa `NEXT_PUBLIC_API_BASE_URL` pada `frontend/.env.local` dan `RUANGKERJA_CORS_ORIGINS` pada `backend/.env` agar URL origin (`http://localhost:3000`) sama persis.
4. **Tesseract OCR Binary berstatus "Belum Ada" di Pengaturan:**
   - Ini normal jika program eksternal Tesseract OCR belum terinstal di komputer Anda. Seluruh 99 fitur lainnya tetap berjalan penuh; Tesseract hanya dibutuhkan untuk fitur **OCR PDF (#15)**.

---

## Roadmap Pengembangan (Lengkap 8 Fase — 100 Fitur Aktif)

- **FASE 1 (Selesai):** Setup proyek, struktur folder, FastAPI foundation, Next.js + Tailwind + komponen UI, Dashboard lengkap, Command Palette (`Ctrl+K`), Dark/Light Mode, dan Diagnostik Backend.
- **FASE 2 (Selesai):** 20 Fitur PDF & Document Tools (termasuk Extract Text, Protect AES-256, Unlock, Metadata Editor, dan Markdown to PDF).
- **FASE 3 (Selesai):** 18 Fitur Image Tools (termasuk Filter, Round Corners/Frame, Favicon Pack, Social Media Resizer, Color Palette Extractor, Strip EXIF, dan cropper interaktif).
- **FASE 4 (Selesai):** 14 Fitur Excel & Data Tools (`.xlsx`, `.xls`, `.csv`, JSON ↔ Excel/CSV, Find & Replace, Merge/Split Kolom, Ringkasan Statistik, PDF Report).
- **FASE 5 (Selesai):** 14 Fitur Calculator & Converter Tools (termasuk Usia/Masa Kerja, Bandwidth, Tipografi CSS, Proporsi Rasio, dan BMI/TDEE).
- **FASE 6 (Selesai):** 12 Fitur Productivity Tools (To-Do + CSV, Global Pomodoro Timer lintas halaman, Work Log + CSV, Text Formatter, QR Code Generator, Markdown Notes, Notulen Rapat, Invoice PDF, Barcode Generator, Stopwatch/Countdown, Diff Checker, Frekuensi Kata).
- **FASE 7 (Selesai):** 22 Fitur Ekspansi Spesialis pada **Developer & API (#79–#90)**, **Keamanan & Utilitas (#91–#95)**, dan **Bisnis & Keuangan (#96–#100)** + Backup/Restore JSON di Settings.
- **FASE 8 (Selesai):** Pengujian end-to-end backend + frontend + smoke test server langsung, audit endpoint OpenAPI & UI, dan finalisasi dokumentasi.

