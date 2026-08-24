# Arsitektur Backend Spatial Indonesia

Node.js + Express + PostgreSQL. Tanpa ORM, tanpa build step, tanpa framework di
sisi dashboard.

Dokumen ini menjelaskan **kenapa** kodenya berbentuk seperti ini. Apa yang ada
di dalamnya bisa dibaca langsung dari source-nya.

> **Catatan istilah.** Istilah teknis ditulis dalam bahasa aslinya —
> *rate limit*, *cache*, *endpoint*, *middleware*, *repository*, *migration*,
> *audit log*. Menerjemahkannya menghasilkan kata yang harus diterjemahkan
> balik di kepala pembaca sebelum bisa dimengerti.

---

## 1. Gambaran besar

```
                    ┌──────────────────────────────────────┐
   Pengunjung ─────▶│  interfaces/http                     │
   (situs 3D)       │  route · controller · middleware     │
                    │  validasi (zod) · OpenAPI            │
   Admin ──────────▶└───────────────┬──────────────────────┘
   (dashboard)                      │  memanggil ke dalam,
                                    ▼  tidak pernah sebaliknya
                    ┌──────────────────────────────────────┐
                    │  application                         │
                    │  service = satu use case             │
                    │  ports.js = antarmuka ke luar        │
                    └───────┬──────────────────────┬───────┘
                            │                      │
                            ▼                      ▼
              ┌──────────────────────┐  ┌────────────────────────┐
              │  domain              │  │  infrastructure        │
              │  entity + kontrak    │◀─│  pg · bcrypt · jwt     │
              │  repository (abstrak)│  │  cache · multer        │
              │  TANPA I/O           │  │  MENGIMPLEMENTASI      │
              └──────────────────────┘  │  kontrak dari domain   │
                                        └────────────────────────┘
                                                   │
                                                   ▼
                                            PostgreSQL
```

Arah dependency **selalu menunjuk ke dalam**. `domain/` tidak meng-import apa
pun dari lapisan lain. `application/` tidak pernah meng-import `pg`, `express`,
`bcrypt`, atau `jsonwebtoken` — semuanya diterima lewat constructor.

Satu-satunya file yang mengenal semua lapisan sekaligus adalah
**`src/container.js`**.

### Kenapa repotnya sepadan

Bukan demi kemurnian teori. Tiga hal konkret:

1. **Bisa dites tanpa database.** Ganti isi `container.js` dengan repository
   palsu, dan semua aturan bisnis bisa diuji tanpa Postgres menyala. Ini yang
   membuat 72 unit test berjalan dalam waktu kurang dari satu detik.
2. **"Siapa memakai apa" punya satu jawaban.** Semua perakitan ada di satu
   layar, bukan tersebar sebagai `import` di lima puluh file.
3. **Daftar method di kontrak berfungsi sebagai rem.** Begitu sebuah service
   butuh sepuluh method dari repository, itu tanda ia mengambil terlalu banyak
   urusan — dan tandanya muncul di `domain/repositories/contract.js`, file yang
   pasti dibaca orang.

---

## 2. Lapisan satu per satu

### `domain/` — fakta dan aturan, tanpa I/O

```
entities/     menu.js · article.js · agenda.js · presence.js
repositories/ contract.js
```

Entity di sini bukan class ber-ORM. Isinya fungsi murni: pemeta row database ke
bentuk yang dipakai frontend, plus aturan yang tidak boleh berbeda antar
pemanggil.

Contoh yang menjelaskan alasannya — `article.js`:

```js
export const isFresh = (publishedAt, freshDays = 30) => { … };
```

Status "baru" bukan kolom, melainkan fungsi dari tanggal terbit. Kalau disimpan
sebagai kolom, ia akan basi diam-diam: artikel bulan lalu tetap menyala "baru"
sampai ada yang ingat mematikannya.

`repositories/contract.js` berisi class abstrak yang setiap method-nya
melempar error. JavaScript tidak punya `interface`; ini penggantinya.
Kontraknya **dipecah per aggregate**, bukan satu `Repository` raksasa — service
artikel tidak perlu mengenal method session admin.

### `application/` — use case

Satu service menangani satu kelompok pekerjaan yang punya alasan berubah yang
sama.

| Service | Tanggung jawab |
| --- | --- |
| `content` | Baca-saja untuk situs. Pemilik endpoint `/bootstrap`. |
| `participation` | Kiriman pengunjung: sparing, jejak kunjungan, form Gabung. |
| `auth` | Login, rotasi session, ganti password. |
| `article-admin` | Penulisan artikel, termasuk gerbang sanitize HTML. |
| `menu-admin` | Tujuh menu beserta parameter orbitnya. |
| `curation` | Agenda, moderasi, pendaftaran, kategori, setting. |
| `user-admin` | Akun admin. |
| `media` | File upload. |
| `monitoring` | Security event, kesehatan database, audit log. |
| `presence-hub` | Presence live. Satu-satunya service yang keadaannya di memori. |
| `sky` | Langit komunitas: satu bintang per pengunjung. |

`ports.js` mendeklarasikan apa yang dibutuhkan lapisan ini dari dunia luar:
`PasswordHasher`, `TokenService`, `Clock`. Service butuh "sesuatu yang bisa
meng-hash password", bukan bcrypt secara spesifik. Bedanya terasa kalau suatu
saat bcrypt diganti argon2: yang berubah satu file di `infrastructure/`, dan
tidak ada satu service pun yang perlu dibuka.

**Aturan yang dijaga:** service melempar `NotFoundError`, bukan memanggil
`res.status(404)`. Itu yang membuat lapisan ini bisa dipakai dari CLI, worker,
atau GraphQL tanpa perubahan.

### `infrastructure/` — yang menyentuh dunia luar

```
db/            pool.js · migrator.js
repositories/  *.pg.js — implementasi kontrak domain
security/      hashing.js (bcrypt) · tokens.js (JWT)
cache/         memory-cache.js
```

Query SQL ditulis eksplisit. Tidak memakai ORM, dan itu keputusan sadar: skema
ini punya beberapa query yang memang perlu ditulis tangan — agregasi JSON untuk
menu, `generate_series` untuk deret grafik, katalog sistem Postgres untuk
kesehatan database. ORM akan jadi lapisan yang harus dilawan, bukan dipakai.

### `interfaces/http/` — Express

```
router.js      merakit tiga kelompok route
routes/        public · auth · admin
controllers/   tipis: HTTP → service → HTTP
middleware/    auth · csrf · validate · error · rate-limit · cache · async
schemas/       zod, satu file
openapi/       dokumen Swagger, ditulis tangan
```

Controller sengaja tidak punya satu pun `try/catch` dan tidak memuat aturan
bisnis. Error naik ke `middleware/error.js` lewat pembungkus `ah()`.

---

## 3. Keputusan yang perlu diketahui sebelum menyentuh apa pun

### `/bootstrap` — satu request untuk seluruh konten

Frontend butuh tujuh hal sekaligus sebelum bisa menggambar tata surya yang
benar: planet, panel, kategori, frekuensi, artikel, agenda, sparing. Tujuh
request HTTP berarti tujuh kali latency jaringan sebelum tampilannya benar.

**Jejak pengunjung sengaja TIDAK ikut.** Isinya berubah setiap ada orang
membuka situs, jadi menggabungkannya membuat seluruh response itu tidak bisa
di-cache. Ia diambil terpisah dan boleh datang belakangan.

### Cache in-memory dengan invalidasi berbasis tag

Ada di `infrastructure/cache/memory-cache.js`. Bukan Redis: ini satu proses,
datanya muat di memori, dan boleh hilang kapan saja. Menambah satu layanan lagi
untuk dirawat demi cache sekecil ini tidak sepadan.

Invalidasinya **berbasis tag, bukan key**: satu perubahan artikel harus
membatalkan `bootstrap`, daftar artikel, dan sparing sekaligus. Menyebut
key-nya satu per satu pasti ada yang terlewat.

> Kalau nanti backend dijalankan lebih dari satu instance, class inilah yang
> diganti Redis. Pemanggilnya tidak berubah — antarmukanya cuma
> `get`/`set`/`wrap`/`invalidate`.

### Presence live tidak menyentuh database

`PresenceHub` adalah satu-satunya service yang menyimpan keadaannya di memori
proses, dan itu keputusan sadar. Data yang dikelolanya — siapa yang sedang
membuka situs, dan sedang melihat planet apa — basi dalam hitungan detik dan
tidak ada gunanya setelah orangnya pergi. Menulisnya ke Postgres berarti satu
INSERT tiap kali seseorang mengklik planet, plus satu tabel yang isinya harus
terus dibersihkan, untuk informasi yang tidak akan pernah dibaca lagi besok.

Jejak yang memang layak disimpan sudah punya tempatnya sendiri
(`presence_visits`), dan itu ditulis sekali saat pengunjung pergi.

**Konsekuensi yang harus diterima:** presence hanya berlaku dalam satu instance.
Dua proses di belakang load balancer berarti dua kelompok pengunjung yang tidak
saling melihat. Itu sepadan untuk sekarang; kalau suatu saat perlu lebih dari
satu instance, yang diganti adalah isi `PresenceHub` — misalnya Redis pub/sub —
dan bukan controller, route, atau klien, karena semuanya sudah bicara lewat
antarmuka yang sama.

Pilihan SSE, bukan WebSocket, mengikuti alasan yang sama. Yang dibutuhkan cuma
satu arah: server memberi tahu klien siapa saja yang ada. Laporan dari klien
("saya sekarang di planet Karya") tetap lewat `POST` biasa yang sudah punya rate
limit dan validasi. WebSocket menambah protokol baru demi kemampuan dua arah
yang tidak dipakai.

Dua hal di jalur ini gampang terlewat dan dua-duanya pernah menggigit:

- **`compression` harus melewatkan `text/event-stream`.** gzip menahan pesan di
  buffer sampai penuh; pesan pertama bisa tertahan berjam-jam. Filter khusus
  untuk itu ada di `app.js`.
- **`presenceHub.tutup()` harus dipanggil sebelum `server.close()`.** Koneksi
  SSE tidak pernah selesai sendiri, jadi `server.close()` akan menunggu
  selamanya. Urutannya sudah benar di `server.js`; jangan dibalik.

### Dua tabel jejak, bukan satu

| Tabel | Isi | Sifat |
| --- | --- | --- |
| `audit_logs` | Apa yang **dilakukan** admin, beserta field yang berubah | Tumbuh pelan, disimpan selamanya, append-only |
| `security_events` | Apa yang **terjadi** pada sistem: penolakan, kegagalan, error | Bisa membanjir saat diserang, dibersihkan setelah 90 hari |

Menggabungkannya akan membuat satu serangan brute force menenggelamkan seluruh
riwayat penyuntingan artikel.

`audit_logs` tidak bisa di-UPDATE maupun di-DELETE, dijaga trigger di level
database. Foreign key ke `admin_users` sengaja dilepas: menghapus akun admin
akan memicu UPDATE pada tabel audit dan ditolak trigger. Kolom `actor_email`
sudah menyimpan siapa pelakunya, dan justru itulah gunanya ia ada.

### Sanitize HTML saat menyimpan, bukan saat menampilkan

`shared/html.js` adalah satu-satunya pintu masuk. Tidak ada HTML dari editor
yang masuk database tanpa melewatinya.

Kalau di-sanitize saat menampilkan, satu jalur render yang lupa memanggilnya
sudah cukup jadi lubang XSS. Menyimpan yang sudah bersih membuat kesalahan itu
tidak mungkin terjadi.

Konsekuensinya: `stripTags()` untuk judul dan kalimat pembuka **mengembalikan
HTML entity jadi karakter biasa** (`&amp;` → `&`), karena nilai itu dirender
lewat `textContent`. Untuk isi artikel, entity justru dipertahankan — hasilnya
memang HTML.

### Session punya family, dan replay-nya terdeteksi

Rotasi refresh token mencabut token lama setiap kali dipakai. Yang membuatnya
berguna adalah langkah berikutnya: kalau token yang **sudah dirotasi** muncul
lagi, itu berarti ada dua pihak memegang token yang sama — pemilik aslinya
sudah lanjut ke token berikutnya.

Setiap session punya `family_id`. Saat replay terdeteksi, seluruh family
dicabut sekaligus, bukan cuma token itu, dan dicatat sebagai security event
dengan severity `critical`. Pemilik aslinya ikut terlempar keluar, dan memang
itu yang diinginkan.

### Migration adalah riwayat, `schema.sql` adalah keadaan

- `db/migrations/*.sql` — satu file per perubahan, dipisah penanda
  `-- migrate:up` / `-- migrate:down`, checksum-nya dicatat.
- `db/schema.sql` — semuanya digabung, untuk setup dari nol. Digenerate.
- `db/seed.sql` — konten awal. Digenerate dari modul data frontend.

**Migration yang sudah dijalankan tidak boleh diedit.** Checksum-nya dicatat,
dan mengeditnya membuat `npm run migrate` berikutnya menolak jalan. Itu
disengaja: migration yang berubah setelah terpasang membuat database dua orang
jadi berbeda padahal versinya sama.

### Pencatatan tidak boleh menggagalkan request

`MonitoringService.catat()` tidak pernah melempar error dan tidak pernah
ditunggu pemanggilnya. Kalau tabel `security_events` bermasalah atau Postgres
sedang sibuk, pengunjung situs tidak boleh melihat error 500 gara-gara sistem
monitoring-nya sendiri.

Pola yang sama dipakai `articles.incrementView()`: pembaca tidak menunggu satu
UPDATE selesai hanya untuk melihat tulisannya.

### Server mengirim kode, bukan kalimat

Dashboard punya dua bahasa. Kalimat jadi yang dikirim server akan selalu muncul
dalam satu bahasa, apa pun yang dipilih pengguna.

Karena itu `MonitoringService._nilai()` mengembalikan `{ kode, n }`, bukan
`"3 percobaan login gagal."` — kalimatnya dirakit di `admin/js/i18n.js`.
Alternatifnya adalah server harus tahu bahasa pengguna, dan itu jauh lebih
rumit untuk manfaat yang sama.

Pesan di `security_events` justru sebaliknya: ia ditulis dalam bahasa Inggris
dan disimpan permanen. Itu catatan log, bukan teks antarmuka, dan
menerjemahkannya saat ditampilkan mustahil karena isinya bebas.

---

## 4. Alur satu request

`PATCH /api/v1/admin/menus/program`

```
1  helmet          HTTP security header
2  cors            origin dicek terhadap whitelist
3  express.json    body di-parse, dibatasi 1 MB
4  noStore         Cache-Control: no-store
5  requireAuth     JWT diverifikasi → req.actor
6  csrfGuard       header X-CSRF-Token dicocokkan dengan cookie
7  limitTulisAdmin rate limit 120/menit
8  validate        zod: params + body; field tak dikenal dibuang
9  controller      req → menuAdmin.update(id, body, actor)
10 service         sanitize HTML · cek tabrakan orbit · hitung diff
11 repository      UPDATE dengan parameter
12 service         invalidate cache berdasarkan tag · tulis audit log + diff
13 controller      res.json(hasil)
```

Kalau ada yang melempar error di langkah mana pun, `ah()` menangkapnya dan
`errorHandler` menerjemahkannya ke response HTTP — sekaligus mencatat security
event kalau kode error-nya termasuk yang dipantau.

---

## 5. Menambah fitur

**Endpoint baca baru:**
1. Method baru di `ContentService`
2. Handler di `public.controller.js`
3. Route + schema + umur cache di `public.routes.js`
4. Path di `openapi/index.js`

**Tabel baru:**
1. `db/migrations/000N_nama.sql` dengan bagian `up` **dan** `down`
2. Kontrak di `domain/repositories/contract.js`
3. Implementasi `*.pg.js`
4. Daftarkan di `container.js`
5. `npm run migrate && npm run schema:dump`

**Menyentuh data yang dipakai frontend:** perhatikan bentuk response
`/bootstrap`. Frontend memetakannya langsung ke modul `src/data/*` lewat
`src/data/remote.js`; mengganti nama field di sini akan memutus scene 3D-nya.

**Teks baru di dashboard:** tambahkan key di `admin/js/i18n.js` untuk **kedua**
bahasa, lalu panggil `t('key')`. Jangan menulis teks langsung di view — kalau
ditulis langsung, ia terkunci pada satu bahasa.
