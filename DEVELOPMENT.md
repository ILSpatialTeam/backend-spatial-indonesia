# Panduan Pengembangan — Backend Spatial Indonesia

Untuk orang yang akan menyentuh kode ini, termasuk diri sendiri enam bulan
lagi. Arsitektur dan alasannya ada di [`ARCHITECTURE.md`](ARCHITECTURE.md);
hasil audit keamanan di [`SECURITY.md`](SECURITY.md); cara naik ke production
di [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 1. Setup dari nol

Butuh Node 20+ dan PostgreSQL 13+.

```bash
brew services start postgresql@18        # atau service Postgres apa pun

createdb spatial_indonesia
psql -d postgres -c "CREATE ROLE spatial_app LOGIN PASSWORD 'ganti-ini';"
psql -d postgres -c "ALTER DATABASE spatial_indonesia OWNER TO spatial_app;"

cd backend
cp .env.example .env                     # isi DATABASE_URL + tiga secret
npm install
npm run migrate                          # bikin skema
npm run seed                             # konten awal + akun admin pertama
npm run dev
```

Generate secret:

```bash
for v in JWT_ACCESS_SECRET JWT_REFRESH_SECRET IP_HASH_SALT; do
  echo "$v=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
done
```

Tiga alamat setelah jalan:

| | |
| --- | --- |
| `http://localhost:4000/api/v1` | REST API |
| `http://localhost:4000/docs` | Swagger, bisa langsung dicoba |
| `http://localhost:4000/admin` | Dashboard |

Frontend dijalankan terpisah dari folder induk — `python3 -m http.server 8899`,
Live Server, atau static server apa pun. Port frontend **harus terdaftar di
`CORS_ORIGINS`**, kalau tidak `/bootstrap` akan ditolak 403.

## 2. Perintah

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Jalan dengan `--watch`, restart setiap file berubah |
| `npm start` | Tanpa watch |
| `npm test` | 94 test: unit + integration |
| `npm run test:unit` | Unit saja — cepat, tidak butuh Postgres |
| `npm run migrate` | Jalankan migration yang belum terpasang |
| `npm run migrate:status` | Mana yang sudah jalan · `!` = file-nya berubah setelah terpasang |
| `npm run migrate:down` | Batalkan **satu** migration terakhir |
| `npm run db:reset` | Turunkan semua → naikkan → isi ulang (ditolak di production) |
| `npm run seed` | Isi konten awal, aman diulang |
| `npm run admin:create` | `-- <email> <nama> <password> [owner\|editor]` |
| `npm run schema:dump` | Bikin ulang `db/schema.sql` dari file migration |

## 3. Bekerja dengan migration

Satu file per perubahan, dinamai `000N_topik.sql`:

```sql
-- 0007_contoh.sql — satu kalimat yang menjelaskan KENAPA, bukan apa.

-- migrate:up
CREATE TABLE contoh ( … );

-- migrate:down
DROP TABLE IF EXISTS contoh;
```

Tiga aturan yang berlaku tanpa kecuali:

- **Jangan pernah mengedit migration yang sudah dijalankan.** Checksum-nya
  dicatat; mengeditnya membuat `npm run migrate` menolak jalan dengan pesan
  yang menyuruh bikin migration baru. Itu bukan gangguan — itu yang mencegah
  database dua orang jadi berbeda padahal versinya sama.
- **Selalu tulis bagian `down`.** Sekalipun isinya cuma `DROP TABLE`.
- **Jalankan `npm run schema:dump` setelahnya**, supaya `db/schema.sql` tetap
  mencerminkan keadaan terbaru.

Kalau perlu mengganti data seed, jangan edit `db/seed.sql` — file itu
digenerate. Ubah `scripts/generate-seed.mjs` lalu jalankan
`node scripts/generate-seed.mjs`.

## 4. Menambah sesuatu

### Fitur yang butuh koneksi terbuka (SSE)

Ada satu jalur yang tidak mengikuti pola request-response biasa:
`GET /presence/live`. Kalau menambah yang serupa, tiga hal harus diurus dan
ketiganya sudah pernah salah:

1. **Lolos dari `compression`.** Filter di `app.js` mengembalikan `false` untuk
   `text/event-stream`. gzip menahan pesan sampai buffer penuh.
2. **Lolos dari rate limit baca.** Koneksinya memang dibuka lama; menghitungnya
   sebagai permintaan biasa akan memblokir pengunjung yang normal.
3. **Ikut ditutup saat shutdown.** `server.close()` menunggu semua koneksi
   selesai, dan koneksi SSE tidak pernah selesai sendiri. `server.js` memanggil
   `presenceHub.tutup()` lebih dulu.

Header `X-Accel-Buffering: no` juga wajib, supaya nginx tidak menahan pesannya
sendiri di depan aplikasi.

### Endpoint publik baru

1. Method baru di `application/services/content.service.js`
2. Handler di `interfaces/http/controllers/public.controller.js` — **tipis**,
   tanpa aturan bisnis
3. Route di `routes/public.routes.js`, lengkap dengan schema validasi dan umur
   cache (`publicCache(detik)` atau `noStore`)
4. Path di `interfaces/http/openapi/index.js`

### Tabel baru

1. Migration (lihat §3)
2. Kontrak di `domain/repositories/contract.js`
3. Implementasi di `infrastructure/repositories/nama.pg.js`
4. Daftarkan di `src/container.js`

### Aturan bisnis baru

Tempatnya di `application/services/`, bukan di controller dan bukan di
repository. Cara cepat memastikannya: kalau aturan itu harus tetap berlaku saat
dipanggil dari script CLI, ia bukan urusan HTTP.

### Teks baru di dashboard

Semua teks antarmuka ada di `admin/js/i18n.js`. Tambahkan key untuk **kedua**
bahasa, lalu panggil `t('key')` di view.

```js
// di i18n.js — kedua kamus
'artikel.tombolArsip': 'Arsipkan',      // id
'artikel.tombolArsip': 'Archive',        // en

// di view
el('button', { class: 'btn' }, t('artikel.tombolArsip'))
```

Tiga hal yang mudah keliru:

- **Key ditulis utuh, jangan dirangkai.** `t('status.' + s)` jalan di runtime
  tapi tidak bisa diperiksa; key yang hilang baru ketahuan saat halamannya
  dibuka orang. Pakai lookup table dengan key lengkap.
- **Jangan pakai nama variabel `t`.** Ia menutupi fungsi terjemahan. Sudah
  pernah kejadian di `ui.js` dan `pemantauan.js`.
- **Bentuk jamak bahasa Inggris** ditangani dengan key `<nama>_one`, dipakai
  otomatis saat `params.n === 1`. Bahasa Indonesia tidak membutuhkannya.

Cek semua key sudah lengkap:

```bash
node --input-type=module -e "
import { readFileSync, readdirSync } from 'node:fs';
const src = readFileSync('admin/js/i18n.js','utf8');
const kamus = new Set([...src.matchAll(/^    '([\w.]+)':/gm)].map(m => m[1]));
const files = ['admin/js/app.js','admin/js/ui.js','admin/js/api.js',
  ...readdirSync('admin/js/views').map(f => 'admin/js/views/'+f)];
for (const f of files)
  for (const m of readFileSync(f,'utf8').matchAll(/\bt\('([\w.]+)'/g))
    if (!kamus.has(m[1])) console.log('HILANG:', m[1], '←', f);
"
```

## 5. Kebiasaan yang dipegang

**Istilah teknis tidak diterjemahkan.** *Rate limit* tetap rate limit,
*cache* tetap cache, *audit log* tetap audit log — di komentar, di dokumentasi,
dan di antarmuka. Kalimat di sekitarnya boleh berbahasa Indonesia. Aturan ini
berlaku juga untuk nama variabel domain.

**Komentar menjelaskan alasan, bukan isi.** `// ambil user` di atas `getUser()`
tidak menambah apa pun. Yang layak ditulis adalah kenapa `decay: 0.9` dan bukan
`2`, kenapa cache di-invalidate berdasarkan tag, kenapa migration tidak boleh
diedit.

**Controller tipis, service tebal, repository bodoh.** Controller
menerjemahkan HTTP. Service memutuskan. Repository hanya tahu SQL.

**Error dilempar, bukan dikembalikan.** `throw new NotFoundError('Artikel')`.
Middleware yang menerjemahkannya ke HTTP.

**Validasi di tepi, aturan bisnis di dalam.** Zod memeriksa *bentuk* data di
`schemas/`; service memeriksa *aturan* — kategorinya ada? orbitnya
bertabrakan? Yang lolos ke service sudah pasti bentuknya benar.

> Yang pernah menggigit: kalau sebuah nilai di-sanitize di service, validasi
> panjangnya harus **diulang setelah sanitize**. `<img src=x>` panjangnya 12
> karakter dan lolos Zod, tapi jadi string kosong setelah tag-nya dibuang.
> Lihat T-2 di `SECURITY.md`.

## 6. Testing

```bash
npm test          # 126 test: unit + integration
npm run test:unit # unit saja — cepat, tanpa Postgres
```

Memakai test runner bawaan Node (`node --test`), tanpa framework tambahan.

```
test/
├── unit/          murni, tanpa I/O — sanitizer, diff, slug, agenda, cache,
│                  dan aturan bisnis service (dengan repository palsu)
├── integration/   aplikasi sungguhan + database sungguhan + HTTP sungguhan
└── helpers/       harness server dan repository palsu
```

Integration test memakai database terpisah (`spatial_indonesia_test`) yang
dikosongkan sebelum setiap test. Role aplikasi sengaja tidak diberi hak
CREATEDB, jadi buat sekali sebagai superuser:

```bash
createdb -O spatial_app spatial_indonesia_test
```

Repository palsu di `test/helpers/fakes.js` **harus menghormati kontrak yang
sama dengan yang asli** — repository Postgres mengembalikan row database
(snake_case), bukan objek yang dikirim ke dalamnya. Palsu yang mengembalikan
bentuk berbeda membuat test lulus terhadap sesuatu yang tidak pernah ada di
production, dan itu lebih buruk daripada tidak punya test sama sekali.

Cek sintaks cepat tanpa menjalankan apa pun:

```bash
find src scripts admin test -name '*.js' -exec node --check {} \;
```

### Mencoba API dari luar

Cara tercepat lewat Swagger di `/docs` — tekan *Authorize*, tempel
`accessToken` dari response login sebagai `bearerAuth` (jalur Bearer tidak
butuh CSRF), lalu coba endpoint-nya langsung.

Untuk script:

```bash
API=localhost:4000/api/v1
T=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"…","password":"…"}' | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
curl -s -H "Authorization: Bearer $T" $API/admin/articles | head -c 400
```

### Mencoba dashboard tanpa login berulang

Modul admin bisa dimuat ulang dengan `fetch` yang di-mock dari console
DevTools — berguna untuk memeriksa tampilan tanpa menyiapkan data:

```js
const asli = window.fetch;
const J = (d) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
window.fetch = async (u, o) => String(u).includes('/auth/me')
  ? J({ id: 'x', email: 'a@b.c', name: 'Uji', role: 'owner' })
  : asli(u, o);
document.querySelector('#akar').replaceChildren();
await import('/admin/js/app.js?p=' + Date.now());
```

### Sebelum rilis

```bash
npm test
npm audit --omit=dev
npm run migrate:status                   # tidak boleh ada tanda !
curl -s $API/health
```

## 7. Jebakan yang sudah pernah menggigit

- **Modul ES di-cache per URL, dan ini akan menipu Anda.** Query `?p=…` hanya
  membuat `app.js` dianggap baru; import statis di dalamnya (`./ui.js`,
  `./views/*.js`) tetap diambil dari module map tab tersebut.
  `fetch(url, { cache: 'reload' })` diikuti `location.reload()` pun tidak
  selalu cukup.
  Gejalanya menyesatkan: sebagian perubahan terlihat, sebagian tidak, sehingga
  tampak seperti bug logika padahal dua versi modul sedang bercampur. Kalau ada
  perilaku yang tidak masuk akal setelah mengedit `admin/js/`, **buka tab baru**
  sebelum mencari penyebab lain. Module map tab baru selalu kosong.
- **CORS bisa gagal tanpa satu pun error di console.** Header di luar daftar
  aman CORS — `If-None-Match` salah satunya — memicu preflight. Kalau tidak ada
  di `allowedHeaders`, preflight-nya **berhasil** (204) tapi request yang
  sebenarnya dibatalkan browser diam-diam. Yang menunjukkannya hanya log
  server: `OPTIONS` tanpa `GET` sesudahnya.
- **Script `type="module"` membawa header `Origin` walaupun same-origin.**
  Whitelist yang tidak memuat origin server sendiri akan menolak modul
  dashboard-nya sendiri.
- **Property instance menutupi method prototype.** `this.taxonomy = repo` di
  constructor membuat method `taxonomy()` di class yang sama tidak akan pernah
  terpanggil. Sudah kejadian dua kali di `application/services/`.
- **Ekspresi index harus IMMUTABLE.** `(created_at::date)` ditolak Postgres
  karena hasilnya bergantung pada timezone session.
- **`Object.assign(style, {'--x': v})` diabaikan diam-diam.** CSS custom
  property hanya bisa diset lewat `setProperty()`.
- **`induk.append(null)` menulis teks "null" ke halaman.** Pakai `pasang()`
  dari `admin/js/ui.js`, yang menyaringnya.
- **Atribut `hidden` kalah oleh `display` apa pun dari class.** Ditutup secara
  global dengan `[hidden] { display: none !important }`.
- **`MutationObserver` yang mengamati subtree lalu mengubahnya akan memakan
  dirinya sendiri.** Lepas observer-nya selama menggambar.
- **Listener yang didaftarkan saat sebuah event sedang berjalan bisa langsung
  ikut terpanggil.** Dialog konfirmasi yang dibuka dari handler Escape sempat
  menutup dirinya sendiri karena listener-nya masuk ke fase bubble yang belum
  dijalankan. Pendaftarannya sekarang ditunda satu putaran event loop.
- **Validation error di API ini berkode 422, bukan 400.** Test baru yang
  menebak 400 akan gagal dengan cara yang terlihat seperti bug aplikasi.
- **`auditList` mengembalikan baris database apa adanya.** Field-nya
  `snake_case` (`entity_id`, `actor_email`), bukan `camelCase` seperti
  kebanyakan response lain. Itu disengaja — audit log memang dibaca sebagai
  catatan mentah — tapi mudah menipu saat menulis test.
- **Semua request test datang dari `127.0.0.1`.** Fitur yang membatasi "satu
  per sumber" jadi mustahil diuji dengan dua pengunjung. Set header
  `X-Forwarded-For`; `trust proxy` sudah bernilai 1, jadi header itu yang
  menentukan `req.ip`. Contohnya ada di `test/integration/sky.test.js`.
- **Sanitasi berjalan setelah validasi panjang.** Payload uji yang panjangnya
  melewati batas tepi (`<img src=x onerror=…>` = 28 karakter, batas nama 24)
  tertolak sebelum sempat menyentuh jalur yang ingin diuji. Pakai muatan pendek
  seperti `<b><i></i></b>` untuk menguji pemeriksaan ulang pasca-sanitasi.

## 8. Menyiapkan production

Daftar lengkapnya di [`DEPLOYMENT.md`](DEPLOYMENT.md). Ringkasnya: ganti kedua
JWT secret, isi `IP_HASH_SALT`, ganti password admin dan role Postgres, set
`COOKIE_SECURE=true`, isi `CORS_ORIGINS` hanya dengan domain frontend, pasang
HTTPS, dan sesuaikan `TRUST_PROXY` dengan jumlah proxy yang benar-benar ada di
depan aplikasi.

Proses menolak jalan kalau JWT secret masih nilai contoh, `IP_HASH_SALT`
kosong, atau `COOKIE_SECURE=false` saat `NODE_ENV=production` — tiga kesalahan
yang paling sering lolos ke production, jadi ketiganya dibuat mustahil.

Backup: `pg_dump` seluruh database. Tidak ada state di luar Postgres kecuali
file di `uploads/`, yang harus ikut di-backup.
