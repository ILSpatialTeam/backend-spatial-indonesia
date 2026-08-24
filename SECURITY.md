# Audit Keamanan — Backend Spatial Indonesia

Diaudit 22 Agustus 2026, diperbarui setelah pengerasan pada hari yang sama. Dijalankan di
lingkungan pengembangan lokal. Semua temuan di bawah **diuji**, bukan
disimpulkan dari membaca kode saja; perintah ujinya dicantumkan supaya bisa
dijalankan ulang.

**Ringkasan:** tidak ditemukan celah kritis atau tinggi. Satu kerentanan
dependensi tingkat rendah diterima dengan mitigasi. Lima temuan sudah diperbaiki
(T-2 sampai T-6), dan tujuh hal perlu dikerjakan sebelum produksi — semuanya
konfigurasi, bukan kode.

Seluruh jalur keamanan sekarang punya tes otomatis: **94 tes** (`npm test`),
termasuk 22 tes integrasi yang menjalankan aplikasi sungguhan di atas database
sungguhan.

---

## 1. Yang diuji dan hasilnya

| # | Uji | Hasil | Cara menguji ulang |
|---|-----|-------|--------------------|
| A | Injeksi SQL lewat parameter query | **Aman** — ditolak 422 oleh validasi sebelum menyentuh database; tabel utuh | `curl --get --data-urlencode "category=' OR '1'='1" $API/articles` |
| B | XSS lewat kiriman publik (sparing) | **Aman** — `<script>` dan atribut kejadian dibuang saat simpan | lihat §3 |
| C | Path traversal pada `/uploads` | **Aman** — 404 untuk `../.env`, `..%2f..%2f.env`, `....//` | `curl $HOST/uploads/../.env` |
| D | Mass assignment (menaikkan peran sendiri) | **Aman** — Zod membuang field tak dikenal sebelum service melihatnya | `POST /auth/change-password` dengan `"role":"owner"` |
| E | JWT `alg: none` | **Aman** — 401; algoritma dikunci ke HS256 | lihat §2 |
| F | Pemisahan peran editor vs owner | **Aman** — editor 403 di `/admin/users`, `/admin/monitor`; 200 di `/admin/articles` | buat akun editor, panggil rute owner |
| G | Rotasi refresh token | **Aman** — token lama 401 setelah dipakai sekali | `POST /auth/refresh` dua kali dengan cookie yang sama |
| H | Rate limit login | **Aman** — 429 pada percobaan ke-10 dalam 15 menit | 12× login gagal beruntun |
| I | Daftar putih CORS | **Aman** — origin asing 403, origin sendiri lolos | `curl -H "Origin: https://jahat.example" $API/bootstrap` |
| J | CSRF pada tulisan lewat cookie | **Aman** — 403 tanpa header `X-CSRF-Token` | `POST /admin/articles` dengan cookie tanpa header |
| K | XSS lewat bintang langit komunitas | **Aman** — tag dibuang saat simpan, lalu divalidasi ulang; `<b><i></i></b>` ditolak 422 | `test/integration/sky.test.js` |
| L | Bintang kedua dari sumber yang sama | **Aman** — 409, unique index atas hash IP; baris kedua tidak tersimpan | `test/integration/sky.test.js` |
| M | Kebocoran identitas di daftar bintang publik | **Aman** — jawaban hanya memuat `id, ra, dec, name, city, note, at`; tidak ada `ip_hash` atau `status` | `test/integration/sky.test.js` |

## 2. Lapisan yang terpasang

**Autentikasi.** Access token JWT HS256 berumur 15 menit + refresh token acak
48 byte berumur 14 hari yang **disimpan sebagai hash** dan bisa dicabut.
Algoritma, issuer, dan audience diverifikasi eksplisit — `alg: none` dan token
yang ditandatangani algoritma lain ditolak.

Login-nya setara-waktu: kalau email tidak terdaftar, password tetap di-hash
terhadap nilai palsu, sehingga lama respons tidak membocorkan akun mana yang
benar-benar ada.

**Cookie** (terverifikasi dari respons `Set-Cookie`):

| Cookie | httpOnly | SameSite | Path | Umur |
|--------|----------|----------|------|------|
| `si_access` | ✓ | Strict | `/` | 20 menit |
| `si_refresh` | ✓ | Strict | `/api/v1/auth` | 14 hari |
| `si_csrf` | — (memang harus terbaca JS) | Strict | `/` | 7 hari |

`si_refresh` sengaja dibatasi path-nya: ia tidak ikut terkirim di permintaan
API biasa, sehingga peluangnya bocor jauh lebih kecil.

**Password.** bcrypt 12 putaran (~250 ms). Minimal 12 karakter, tanpa
kewajiban simbol — panjang lebih menentukan, dan aturan "harus ada simbol"
justru mendorong pola yang mudah ditebak. Mengganti password mencabut semua
sesi lain.

**Header** (terverifikasi): CSP tanpa satu pun host luar (`script-src 'self'`),
`frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`. HSTS aktif hanya di produksi.

**Rate limit:** baca 300/menit · login 10/15 menit (percobaan berhasil tidak
dihitung) · kiriman publik 8/10 menit · tulis admin 120/menit. Ditambah batas
kedua di database untuk sparing (5/jam per sumber) yang **selamat dari restart
proses** — counter in-memory bisa dikosongkan hanya dengan membuat server
gagal.

**Injeksi.** Seluruh nilai lewat parameter `$1`. Satu-satunya interpolasi ke
dalam string SQL adalah nama kolom konstan (`KOLOM`, `PILIH`, `AMAN`) yang tidak
pernah berasal dari masukan pengguna — diverifikasi dengan pemindaian:

```bash
grep -rno 'query(`[^`]*\${[a-zA-Z_.]*' src/ | sed 's/.*\${//' | sort -u
# → AMAN KOLOM PILIH
```

**XSS.** HTML dari editor di-sanitize **saat simpan**, bukan saat tampil.
Membalik urutannya berarti satu jalur render yang lupa memanggil sanitizer sudah
cukup jadi lubang. Daftar putih tag sempit; `javascript:` dan `data:` ditutup;
tautan keluar otomatis dapat `rel="noopener noreferrer nofollow"`.

**Privasi.** IP tidak pernah disimpan mentah di tabel mana pun — hanya hash
SHA-256 ber-salt, cukup untuk mengenali sumber yang sama, tidak cukup untuk
mengidentifikasi orang. Log ter-redaksi pada `authorization`, `cookie`,
`set-cookie`, dan setiap field bernama `password*`.

**Audit log.** Setiap perubahan admin tercatat di `audit_logs` beserta medan yang
berubah dan nilai lama/barunya. Setiap penolakan dan error tercatat di
`security_events`. Keduanya bisa dibaca di halaman **Pemantauan**.

## 3. Temuan

### T-1 · Rendah · Diterima dengan mitigasi
**Quill 2.0.3 rentan XSS lewat fitur ekspor HTML** (`npm audit`, severity low).

Dampaknya terbatas: kerentanannya ada pada rendering di sisi editor, sementara
HTML yang tersimpan **selalu** melewati `sanitizeArticleHtml()` di server
sebelum masuk database. Penyerang harus sudah memegang akun admin untuk
memicunya, dan pada titik itu ia sudah bisa menulis artikel apa pun.

Tidak dinaikkan versi karena perbaikannya major dan Quill 2.0.2 (versi yang
disarankan `npm audit`) justru lebih lama. Pantau rilis Quill berikutnya.

### T-2 · Rendah · **Sudah diperbaiki**
**Validasi panjang berjalan sebelum sanitize.** Nama pengirim
`<img src=x onerror=alert(1)>` berpanjang 26 karakter sehingga lolos Zod, lalu
jadi string kosong setelah tagnya dibuang, dan yang menolaknya adalah CHECK
constraint database — dengan pesan "Nilai melanggar aturan data" yang tidak
memberi tahu pengirim apa pun.

Bukan celah keamanan (data buruk tetap ditolak), tapi pesan error yang
membingungkan dan pemeriksaan yang terjadi satu lapis terlalu dalam. Sekarang
`ParticipationService` memvalidasi ulang setelah sanitize dan mengembalikan
pesan yang bisa ditindak. Berlaku untuk sparing dan formulir Gabung.

### T-3 · Sedang · **Sudah diperbaiki**
**Formulir Gabung membocorkan siapa yang sudah terdaftar.** Email baru dijawab
"Terima kasih!", email yang sudah ada dijawab "Email ini sudah terdaftar dan
sedang kami proses" — sehingga siapa pun bisa menguji apakah seseorang anggota
komunitas hanya dengan mengirimkan alamatnya.

Sekarang kedua jalur menjawab identik dan tidak mengembalikan id apa pun;
duplikatnya ditelan diam-diam di server.

### T-4 · Sedang · **Sudah diperbaiki**
**Replay refresh token tidak terdeteksi.** Rotasi sudah mencabut token lama,
tapi kalau token yang sudah dirotasi dipakai lagi, jawabannya hanya 401 —
padahal itu sinyal terkuat bahwa sesi dicuri: pemilik aslinya sudah lanjut ke
token berikutnya, jadi yang memakai token lama pasti pihak lain.

Session kini punya `family_id`. Saat replay terdeteksi, **seluruh keluarga sesi
dicabut** (pemilik asli ikut terlempar keluar — memang itu yang diinginkan) dan
dicatat sebagai kejadian `critical`.

### T-5 · Rendah · **Sudah diperbaiki**
**Tabel `audit_logs` bisa dihapus oleh peran aplikasi sendiri.** Aplikasi tidak
pernah memakainya, tapi kalau kredensial database bocor, membersihkan jejak
adalah hal pertama yang dilakukan penyerang yang rapi.

Sekarang append-only lewat trigger — bukan sekadar `REVOKE`, karena pemilik
tabel bisa memberikan haknya kembali kepada dirinya sendiri. Foreign key ke
`admin_users` dilepas agar penghapusan akun tidak lagi memicu UPDATE pada tabel
audit; `actor_email` sudah menyimpan siapa pelakunya.

### T-6 · Rendah · **Sudah diperbaiki**
**Garam hash IP menumpang pada `JWT_ACCESS_SECRET`.** Merotasi JWT — yang
seharusnya rutin — akan memutus seluruh korelasi sumber di halaman Pemantauan
tanpa ada yang menyadari kenapa. Sekarang `IP_HASH_SALT` terpisah, dan wajib
diisi di produksi.

### T-7 · Informasional
**Endpoint publik `POST /presence` bisa dipakai mengisi tabel jejak.** Sudah
dibatasi 8 kiriman per 10 menit per IP dan id planet divalidasi terhadap daftar
menu, jadi isinya tidak bisa dikarang. Dampak terburuk adalah data statistik
yang berisik, bukan kebocoran. Kalau jadi masalah, tambahkan pemeriksaan bahwa
lintasannya masuk akal (tidak ada planet yang sama berturut-turut — sudah
dilakukan) atau jadikan endpoint ini butuh token sesi ringan.

### T-8 · Rendah · Diterima dengan mitigasi
**Koneksi SSE `/presence/live` sengaja tidak kena rate limit baca.** Endpoint
ini memang membuka koneksi yang bertahan lama, jadi menghitungnya sebagai
permintaan biasa akan memblokir pengunjung yang perilakunya normal.

Yang membatasi gantinya adalah **jumlah**: maksimum 200 koneksi bersamaan per
instance, setelah itu server menolak dan menutup. Tiap koneksi hanya memegang
satu objek kecil di memori dan satu handle soket, jadi 200 koneksi adalah beban
yang wajar. Batas jumlah file descriptor pada proses tetap menjadi pagar
terakhir dan harus dipertimbangkan saat menyetel ulimit di server.

Sisa risikonya: satu pihak bisa memakai seluruh 200 slot itu dari satu mesin
dan membuat presence tampak penuh bagi pengunjung berikutnya. Dampaknya
terbatas pada fitur presence — situsnya, API-nya, dan databasenya tidak
terpengaruh sama sekali, karena presence tidak menyentuh database. Kalau ini
jadi masalah nyata, batasi jumlah koneksi per IP hash, bukan per instance.

### T-9 · Rendah · Diterima dengan mitigasi
**Langit komunitas adalah konten publik yang ditulis pengunjung.** Nama, kota,
dan satu kalimat catatan tampil untuk semua orang. Yang menjaganya:

- HTML dibuang saat simpan (`stripTags`), lalu **divalidasi ulang** — masukan
  yang seluruhnya tag akan lolos pemeriksaan panjang di tepi lalu jadi kosong;
  pola yang sama dengan T-2.
- Panjangnya sempit dengan sengaja: nama 24 karakter, kota 40, catatan 60.
  Batasan itu bukan kenyamanan, melainkan pengaman — kalau dibiarkan bebas,
  dalam sebulan langitnya jadi papan iklan.
- Satu bintang per sumber, dijaga unique index atas salted hash alamat IP.
- Moderasi bisa dinyalakan kapan saja lewat setting `sky.moderation`, tanpa
  deploy ulang. Antreannya ada di dashboard.

**Kelemahan yang harus disebut apa adanya:** aturan "satu orang satu bintang"
sebenarnya adalah "satu alamat IP satu bintang". Siapa pun yang punya banyak
alamat — VPN, jaringan seluler, cloud — bisa menaruh banyak bintang. Sebaliknya,
di belakang CGNAT beberapa orang yang berbeda berbagi satu alamat, dan yang
kedua akan ditolak 409 padahal ia berhak. Tidak ada cara memperbaiki keduanya
sekaligus tanpa meminta orang membuat akun, dan itu ongkos yang jauh lebih besar
daripada masalahnya. Nyalakan moderasi kalau penyalahgunaannya mulai terlihat.

Alamat IP mentahnya sendiri **tidak pernah disimpan** — hanya hash SHA-256
bergaram, dengan `IP_HASH_SALT` yang terpisah dari secret JWT (lihat T-6).

## 4. Wajib dikerjakan sebelum produksi

| # | Hal | Kenapa |
|---|-----|--------|
| 1 | **Ganti `ADMIN_PASSWORD`** dari `.env` | Akun owner pertama masih memakai nilai contoh `Ubah-Password-Ini-1` |
| 2 | Bangkitkan ulang `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` | Proses menolak jalan kalau masih `ganti-saya`, tapi nilai dev yang bocor tetap harus diganti |
| 2b | Isi `IP_HASH_SALT` | Wajib di produksi (proses menolak jalan tanpanya). Harus **berbeda** dari JWT secret — lihat T-6 |
| 3 | `COOKIE_SECURE=true` | Proses menolak jalan tanpa ini di produksi — pastikan HTTPS sudah ada |
| 4 | Isi `CORS_ORIGINS` dengan domain frontend saja | Hapus `localhost:8899` dan `localhost:5500` |
| 5 | Ganti password role Postgres `spatial_app` | `spatial_dev_password` hanya untuk mesin lokal |
| 6 | Pasang HTTPS + reverse proxy, sesuaikan `trust proxy` | `app.set('trust proxy', 1)` mengasumsikan **satu** proxy di depan; salah hitung membuat rate limit bisa dikelabui lewat header palsu |
| 7 | Pastikan `/uploads` dilayani proxy tanpa eksekusi skrip | Sudah ada `nosniff`, tapi lapis kedua di nginx murah |

## 5. Yang sengaja belum ada

Disebutkan supaya tidak dikira terlupa:

- **2FA untuk akun admin.** Layak ditambah kalau jumlah admin bertambah;
  untuk satu-dua orang, password panjang + sesi yang bisa dicabut sudah
  sepadan.
- **Penguncian akun setelah N kegagalan.** Sengaja tidak dipakai: ia berubah
  jadi cara mengunci admin dari luar (denial of service) hanya dengan menebak
  passwordnya berkali-kali. Rate limit per IP memberi perlindungan yang
  sama tanpa efek samping itu.
- **Enkripsi kolom di database.** Tidak ada rahasia yang disimpan selain hash
  password dan hash token, dan keduanya memang tidak bisa dibalik.
- **Web Application Firewall.** Lapisan infrastruktur, bukan aplikasi.
- **Pemindaian dependensi otomatis di CI.** Belum ada CI. `npm audit` di
  `DEVELOPMENT.md` menyebutnya sebagai langkah manual sebelum rilis.

## 6. Menjalankan ulang audit ini

```bash
npm test                                 # 94 tes, mencakup seluruh jalur keamanan
npm audit --omit=dev                     # kerentanan dependensi
grep -rno 'query(`[^`]*\${[a-zA-Z_.]*' src/ | sed 's/.*\${//' | sort -u
curl -s -D- -o /dev/null $API/health     # periksa header
```

Uji perilaku (login, peran, CSRF, rotasi token, path traversal) ada di tabel §1
beserta perintahnya.
