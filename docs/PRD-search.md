# PRD: Search dan Download CSV Klaim

Status: **DRAFT, sudah diimplementasi**. Angka dan aturan bisnis tetap perlu dikonfirmasi ke pemilik fitur. Kalau ada yang berubah, kode dan tes disesuaikan.
Proyek: HantuKlaim (ops-finance). Disusun lewat interview; jawaban yang sudah dipilih ditandai "(terkonfirmasi)".

## Masalah

Finance menyalin data klaim ke Excel satu per satu untuk rekap. Daftar klaim juga belum bisa dicari: makin banyak klaim, makin lama mencari satu klaim (misalnya semua klaim "taksi") secara manual.

## Pengguna

| Pengguna | Kebutuhan |
| --- | --- |
| Sales (Rina, Budi) | Mencari dan mengunduh klaim **miliknya sendiri**. |
| Admin finance (Dewi) | Mencari dan mengunduh **semua** klaim untuk rekap. |

## Aturan bisnis

1. Search mencari di kolom `merchant` dan `description` (catatan klaim). (terkonfirmasi)
2. Pencarian tidak membedakan huruf besar/kecil dan cocok sebagian kata ("taks" menemukan "Taksi Bandara").
3. Filter tanggal `from` dan `to` memakai `spent_on` (tanggal transaksi), batas awal dan akhir **inklusif**. (terkonfirmasi)
4. Search, filter status, dan filter tanggal bisa dipakai bersamaan (semua syarat harus terpenuhi).
5. Download CSV berisi **hasil yang sedang difilter**, bukan seluruh klaim. (terkonfirmasi)
6. Hak akses tidak berubah: sales hanya melihat klaim miliknya, admin melihat semua. Aturan ini dijaga di Worker, termasuk untuk search dan CSV.
7. Kolom CSV berurutan: `id, tanggal, kategori, merchant, nominal, status`. Nominal berupa angka rupiah bulat tanpa pemisah ribuan.
8. Sel CSV yang diawali `=`, `+`, `-`, atau `@` diberi awalan tanda kutip tunggal `'` supaya tidak dieksekusi sebagai formula Excel.
9. Batas maksimal **5.000 baris** per CSV. (terkonfirmasi)

## Acceptance criteria

Setiap kriteria bisa diuji pass/fail dan dipetakan ke satu test di `test/worker/`.

| # | Kriteria | Nama test |
| --- | --- | --- |
| 1 | Search "taksi" mengembalikan klaim yang `merchant` atau `description`-nya mengandung "taksi" (tanpa membedakan huruf besar/kecil). | "search merchant dan description" |
| 2 | Search "taksi" oleh Rina hanya mengembalikan klaim Rina, walau Budi punya klaim "taksi". | "search sales hanya miliknya" |
| 3 | Filter `from=2026-10-19&to=2026-10-20` mengembalikan klaim bertanggal 19 dan 20 Oktober (batas inklusif) dan tidak yang di luar rentang. | "filter tanggal inklusif" |
| 4 | `from` lebih besar dari `to`, atau format tanggal bukan `YYYY-MM-DD`, ditolak dengan status 400 dan pesan yang jelas. | "validasi tanggal" |
| 5 | Search, status, dan tanggal digabung: hanya klaim yang memenuhi semua syarat yang muncul. | "kombinasi filter" |
| 6 | Karakter `%` dan `_` di kolom search dicari sebagai teks biasa, bukan wildcard SQL. | "search karakter khusus" |
| 7 | Search tanpa hasil mengembalikan daftar kosong (bukan error). CSV tanpa hasil berisi baris header saja. | "hasil kosong" |
| 8 | CSV berisi kolom `id, tanggal, kategori, merchant, nominal, status` dengan urutan itu. | "kolom CSV sesuai urutan" |
| 9 | Sel yang diawali `=`, `+`, `-`, atau `@` diberi tanda kutip tunggal di depannya. | "escape sel formula" |
| 10 | Merchant yang mengandung koma, tanda kutip ganda, atau baris baru tetap menghasilkan CSV valid (di-quote dan di-escape). | "quoting CSV" |
| 11 | CSV sales hanya berisi klaim sales itu. CSV admin berisi semua klaim yang cocok dengan filter. | "CSV sales hanya miliknya" |
| 12 | CSV mengikuti filter yang sedang aktif (search, status, tanggal). | "CSV mengikuti filter" |
| 13 | Hasil lebih dari 5.000 baris ditolak dengan pesan agar filter dipersempit, tidak dipotong diam-diam. | "batas 5000 baris" |
| 14 | Search di 500 klaim selesai kurang dari 300 ms di D1 lokal. | "search 500 klaim < 300 ms" |
| 15 | Pengguna tanpa login mendapat 401 untuk search dan CSV. | "search dan CSV butuh login" |
| 16 | Teks perintah di merchant atau description (misalnya dari struk) hanya diperlakukan sebagai teks: tidak ada klaim yang berubah status dan tidak ada HTML yang dirender. | "isi klaim tetap data" |

## Non-goals

Tidak dikerjakan di fitur ini:

- Export PDF atau Excel (.xlsx). Hanya CSV.
- Email terjadwal atau pengiriman laporan otomatis.
- Search fuzzy, full-text, atau pencarian di `decision_note` dan nama pemilik.
- Perubahan aturan akses, peran, atau token.
- Tool MCP baru. Claude Code tetap hanya punya `whoami`, `list_my_claims`, `get_claim`, dan `submit_claim_from_receipt`.
- Penyimpanan filter favorit, pagination baru, atau perubahan tampilan di luar kotak search, filter tanggal, dan tombol download.
- Tampilan CSV di dalam aplikasi atau pratinjau.

## Constraint

- Maksimal **5.000 baris** per CSV.
- Tanpa data nasabah. Data di aplikasi ini hanya klaim biaya Tim Ops Sales.
- Berjalan di Worker (Hono) dengan D1; query wajib berparameter (tidak boleh menggabungkan input ke SQL).
- Mengikuti aturan keamanan di `CLAUDE.md`: hak akses hanya di Worker, data dirender dengan `textContent`.
- Search dan CSV harus melewati jalur auth yang sama dengan `/api/claims` (cookie session atau token).

## Catatan teknis (sudah diterapkan)

- Perluas `GET /api/claims` dengan parameter `q`, `from`, `to`, `status`; tambahkan endpoint unduhan CSV yang memakai filter yang sama.
- Pakai satu fungsi filter bersama untuk daftar dan CSV supaya hasilnya selalu konsisten.
- Kolom di aplikasi: `description` = "note", `spent_on` = "claim_date" pada contoh di slide.

## Status implementasi

Semua 16 acceptance criteria sudah diimplementasi dan dites (`test/worker/search.test.ts`; seluruh suite 56 tes hijau).

- API: `GET /api/claims?q=&from=&to=&status=` dan `GET /api/claims.csv` dengan filter yang sama (`src/search.ts`).
- UI: kotak search, filter tanggal Dari/Sampai, tombol Reset dan Unduh CSV di daftar klaim.

Keputusan sementara untuk pertanyaan terbuka (mudah diganti di `src/search.ts`):

| Pertanyaan | Yang dipakai sekarang |
| --- | --- |
| Pemisah CSV | Koma, baris diakhiri CRLF |
| BOM UTF-8 | Tidak ada |
| Kolom pemilik untuk admin | Tidak ada (sesuai urutan kolom di slide) |
| Escape tab dan carriage return | Belum; hanya `= + - @` sesuai PRD |
| Nama file | `klaim-YYYY-MM-DD.csv` |

Tambahan di luar PRD: kata kunci search dibatasi 100 karakter (lebih dari itu ditolak 400).

## Pertanyaan terbuka (konfirmasi ke pemilik fitur)

1. Excel versi Indonesia sering memakai titik koma `;` sebagai pemisah. CSV memakai koma atau titik koma?
2. Perlu BOM UTF-8 supaya karakter non-ASCII terbaca benar di Excel?
3. Untuk admin, perlu kolom tambahan nama pemilik? (Urutan kolom di slide tidak memuatnya.)
4. Perlu juga meng-escape sel yang diawali tab atau carriage return, selain `= + - @`?
5. Nama file unduhan, misalnya `klaim-YYYY-MM-DD.csv`?

## Checklist sebelum PRD dipakai

- [ ] Masalah dan pengguna jelas
- [ ] Setiap kriteria dapat diuji pass/fail
- [ ] Non-goals menutup fitur tambahan
- [ ] Constraint menyebut angka
- [ ] Pertanyaan terbuka sudah dijawab pemilik fitur
