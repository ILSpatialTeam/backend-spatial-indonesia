# Backend Spatial Indonesia

REST API dan dashboard admin untuk situs tata surya interaktif Spatial Indonesia.
Node.js + Express + PostgreSQL. Tanpa ORM, tanpa build step.

Frontend-nya terpisah, ada di folder induk (`../src`, `../index.html`), dan
hanya berkomunikasi dengan backend lewat HTTP. Folder ini bisa dipindah ke
repository sendiri tanpa mengubah satu baris pun.

```
http://localhost:4000/api/v1   REST API
http://localhost:4000/docs     Dokumentasi API (Swagger)
http://localhost:4000/admin    Dashboard admin
```

## Dokumentasi

| File | Isi |
| --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Susunan lapisan kode, keputusan desain, dan alasannya |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Setup, cara menambah fitur, cara testing, dan jebakan yang sudah pernah menggigit |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Naik ke production: Docker, systemd, reverse proxy, backup |
| [`SECURITY.md`](SECURITY.md) | Hasil audit keamanan dan cara menjalankannya ulang |

## Menjalankan

Butuh Node 20+ dan PostgreSQL 13+.

```bash
cp .env.example .env          # isi DATABASE_URL dan tiga secret di dalamnya
npm install
npm run migrate               # bikin skema database
npm run seed                  # isi konten awal + akun admin pertama
npm run dev
```

Generate secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Perintah lain

| Perintah | Kegunaan |
| --- | --- |
| `npm test` | 94 test: unit (tanpa database) + integration (pakai database khusus test) |
| `npm run test:unit` | Unit test saja — cepat, tidak butuh Postgres |
| `npm run migrate:status` | Migration mana yang sudah jalan, dan mana yang file-nya berubah |
| `npm run migrate:down` | Batalkan **satu** migration terakhir |
| `npm run db:reset` | Turunkan semua migration, naikkan lagi, isi ulang (ditolak di production) |
| `npm run admin:create` | `-- <email> <nama> <password> [owner\|editor]` |
| `npm run schema:dump` | Bikin ulang `db/schema.sql` dari file migration |

## Database

Ada tiga file SQL dengan peran berbeda:

- **`db/migrations/*.sql`** — riwayat perubahan. Satu file per perubahan,
  dipisah penanda `-- migrate:up` / `-- migrate:down`, dijalankan berurutan dan
  dicatat di tabel `schema_migrations`. Ini yang dipakai untuk database yang
  sudah berjalan.
- **`db/schema.sql`** — bentuk skema saat ini dalam satu file, untuk setup dari
  nol tanpa memutar ulang semua migration. Digenerate, jangan diedit manual.
- **`db/seed.sql`** — konten awal (tujuh menu, enam artikel, agenda, sparing).
  Aman dijalankan berulang; tidak menyentuh akun admin maupun data kiriman
  pengunjung.

Setup dari nol tanpa Node:

```bash
createdb spatial_indonesia
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
```

Migration yang **sudah pernah dijalankan tidak boleh diedit** — checksum-nya
dicatat, dan mengeditnya akan ditolak saat migration berikutnya jalan. Bikin
file migration baru.

## Struktur kode

```
src/
├── domain/          entity + kontrak repository (abstrak). Tidak menyentuh I/O.
├── application/     use case. Tahu aturan bisnis, tidak tahu HTTP atau SQL.
│   ├── ports.js         antarmuka ke luar (password hasher, token service)
│   └── services/
├── infrastructure/  yang berurusan dengan dunia luar
│   ├── db/              connection pool, migration runner
│   ├── repositories/    implementasi Postgres dari kontrak domain
│   ├── security/        bcrypt, JWT
│   └── cache/
├── interfaces/http/ Express: route, controller, middleware, schema, OpenAPI
├── shared/          error, logger, HTML sanitizer, slug
├── container.js     composition root — satu-satunya tempat semuanya dirakit
└── app.js           susunan middleware Express
```

Arah dependency selalu ke dalam: `interfaces` → `application` → `domain`.
Lapisan `domain` tidak meng-import apa pun dari luar dirinya, dan `application`
tidak pernah meng-import `pg` — repository-nya diterima lewat constructor.
Manfaat nyatanya: mengganti Postgres dengan repository palsu untuk testing
cukup mengubah `container.js`.

## Keamanan

| Lapisan | Cara |
| --- | --- |
| HTTP header | helmet + CSP ketat (tanpa host eksternal; Quill di-serve dari lokal) |
| CORS | whitelist origin, bukan pantulan; `credentials` aktif |
| Session | JWT 15 menit di cookie httpOnly + refresh token yang bisa dicabut |
| Token rotation | Refresh token yang sudah dipakai lalu muncul lagi → seluruh session family dicabut |
| CSRF | Double-submit token, wajib untuk semua operasi tulis lewat cookie |
| Password | bcrypt 12 round; waktu respons login sama untuk akun yang ada maupun tidak |
| SQL injection | Semua query pakai parameter, tidak ada penggabungan string |
| XSS | HTML dari editor di-sanitize **saat disimpan**, dengan whitelist tag yang sempit |
| Rate limit | Baca 300/menit · login 10/15menit · kiriman publik 8/10menit |
| Upload | Maks 4 MB, whitelist MIME type, nama file digenerate server |
| Privasi | IP disimpan sebagai salted hash, tidak pernah mentah |
| Audit log | Setiap perubahan admin tercatat, dan tabelnya append-only |

Sebelum production: ganti kedua JWT secret, isi `IP_HASH_SALT`, set
`COOKIE_SECURE=true` (proses menolak jalan kalau tidak), dan isi
`CORS_ORIGINS` hanya dengan domain frontend. Daftar lengkapnya di
[`DEPLOYMENT.md`](DEPLOYMENT.md).

## Performa

- `GET /bootstrap` mengirim seluruh konten situs dalam satu response — frontend
  tidak perlu menunggu tujuh request sebelum tata suryanya benar.
- Cache in-memory dengan tag, otomatis di-invalidate setiap admin menyimpan.
- ETag di endpoint publik: kunjungan berikutnya berakhir 304 tanpa body
  (13,7 KB → 0 byte).
- gzip (13,7 KB → 5,2 KB).
- Menu + item + link diambil dalam satu query lewat agregasi JSON, bukan N+1.
- Daftar artikel tidak membawa isi tulisan; isinya baru diambil saat dibuka.
- Partial index untuk artikel published, sparing approved, dan agenda tayang.

## Dashboard admin

Vanilla JavaScript, tanpa framework dan tanpa build step. Tersedia dalam
**bahasa Indonesia dan Inggris** — tombol ID/EN ada di topbar dan di halaman
login. Pilihannya disimpan di browser, dan bahasa awalnya mengikuti setelan
browser.

Semua teks antarmuka ada di `admin/js/i18n.js`. Aturannya: istilah teknis tetap
dalam bahasa aslinya (rate limit, cache, endpoint, token, session, audit log,
security event), kalimat di sekitarnya diterjemahkan.

## Fitur kebersamaan

Dua fitur membuat situsnya terasa dihuni, dan keduanya punya bentuk teknis yang
berbeda dari sisa API:

**Presence live** — `GET /presence/live` (Server-Sent Events) menyiarkan siapa
saja yang sedang membuka situs dan planet apa yang sedang mereka lihat; klien
melaporkan posisinya lewat `POST /presence/here`. Keadaannya di memori proses,
bukan di database: data ini basi dalam hitungan detik. Konsekuensinya presence
hanya berlaku dalam satu instance — dua proses di belakang load balancer berarti
dua kelompok pengunjung yang tidak saling melihat.

**Langit komunitas** — `GET`/`POST /sky/stars` dan `GET /sky/mine`. Satu bintang
per pengunjung, ditaruh sendiri dengan menunjuk langit di situs. Aturan satu
bintang dijaga unique index atas salted hash alamat IP; alamat mentahnya tidak
pernah disimpan. Moderasinya opsional lewat setting `sky.moderation` — bawaannya
bintang langsung menyala — dan antreannya ada di dashboard, menu **Langit
komunitas**.

## Integrasi dengan frontend

Frontend membaca `<meta name="spatial-api">` di `../index.html`. Ganti isinya
ke domain backend saat production, atau hapus meta-nya kalau API di-serve dari
origin yang sama.

Alurnya ada di `../src/data/remote.js`: snapshot dari localStorage diterapkan
**secara sinkron** sebelum scene 3D dibangun, lalu data terbaru diambil di
belakang layar. Kalau backend mati, situsnya tetap tampil dengan data bawaan —
yang hilang cuma kemutakhirannya.
