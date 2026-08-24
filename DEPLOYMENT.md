# Deployment Backend Spatial Indonesia

Backend ini satu proses Node dan satu database Postgres. Tidak ada message
queue, tidak ada Redis, tidak ada worker. Itu membuat deployment-nya sederhana
— dan sebagian besar isi dokumen ini justru tentang hal di sekitarnya: secret,
HTTPS, backup, dan apa yang terjadi saat update.

Arsitekturnya di [`ARCHITECTURE.md`](ARCHITECTURE.md), audit keamanan di
[`SECURITY.md`](SECURITY.md), pengembangan sehari-hari di
[`DEVELOPMENT.md`](DEVELOPMENT.md).

---

## 1. Sebelum apa pun: sembilan hal yang wajib diganti

Proses **menolak menyala** kalau nomor 2, 3, 4, atau 5 belum benar saat
`NODE_ENV=production`. Sisanya tidak dijaga kode — Anda yang harus ingat.

| # | Variabel | Kenapa |
| --- | --- | --- |
| 1 | `NODE_ENV=production` | Mematikan stack trace di response error dan menyalakan HSTS |
| 2 | `JWT_ACCESS_SECRET` | Nilai contoh `ganti-saya` ditolak. 48 byte acak |
| 3 | `JWT_REFRESH_SECRET` | Sama, dan **harus berbeda** dari yang di atas |
| 4 | `IP_HASH_SALT` | Salt untuk hash IP. Harus berbeda dari JWT secret — lihat T-6 di SECURITY.md |
| 5 | `COOKIE_SECURE=true` | Tanpa ini cookie session admin bisa dikirim lewat HTTP polos |
| 6 | `CORS_ORIGINS` | Isi domain frontend saja. Hapus semua `localhost` |
| 7 | `PUBLIC_URL` | Dipakai membentuk URL gambar yang di-upload admin |
| 8 | `TRUST_PROXY` | Jumlah proxy di depan aplikasi — lihat §4 |
| 9 | `ADMIN_PASSWORD` | Akun owner pertama. Ganti dari nilai di `.env.example` |

```bash
# Generate tiga secret sekaligus
for v in JWT_ACCESS_SECRET JWT_REFRESH_SECRET IP_HASH_SALT; do
  echo "$v=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
done
```

> Secret tidak pernah masuk ke dalam image. `.env` ada di `.dockerignore`, dan
> konfigurasinya di-inject saat container berjalan. Kalau ikut ter-*bake*,
> siapa pun yang bisa menarik image Anda mendapatkan kredensial production.

---

## 2. Cara A — Docker Compose (satu mesin)

Paling cocok untuk VPS. Backend dan Postgres jalan berdampingan, dan
database-nya tidak terbuka ke luar mesin.

```bash
cd backend
cp .env.example .env
# isi secret dari §1, plus POSTGRES_PASSWORD

docker compose up -d --build
docker compose exec api npm run seed     # sekali saja, di awal
docker compose logs -f api
```

Migration dijalankan otomatis sebelum server menyala (`RUN_MIGRATIONS=true` di
compose). Server memang menolak start kalau ada migration yang tertinggal, jadi
urutannya dijamin benar.

> **`.env` untuk development tidak bisa dipakai apa adanya.** Compose menyetel
> `NODE_ENV=production`, dan pada mode itu proses menolak menyala kalau JWT
> secret masih nilai contoh, `IP_HASH_SALT` kosong, atau `COOKIE_SECURE` masih
> `false`. Ini disengaja — ketiganya kesalahan yang paling sering lolos ke
> production, jadi dibuat mustahil.
>
> Gejalanya: container langsung keluar, dan `docker compose logs api` mencetak
> variabel mana yang bermasalah. Itu penolakan yang direncanakan, bukan crash.

Cek hasilnya:

```bash
curl -s localhost:4000/api/v1/health
docker compose ps          # kolom STATUS harus "healthy", bukan sekadar "Up"
```

### Yang perlu diperhatikan di compose

- **`ports: "127.0.0.1:4000:4000"`** — Node tidak menghadap internet. Yang
  menghadap adalah reverse proxy di depannya (§4). Kalau ditulis `"4000:4000"`
  saja, Docker akan membuka port itu ke seluruh dunia **menembus ufw** —
  jebakan yang sudah membocorkan banyak database.
- **Volume `uploads`** — gambar yang di-upload admin. Tanpa ini semuanya hilang
  setiap kali container diganti, dan mengganti container adalah cara normal
  meng-update aplikasi.
- **`postgres:18-alpine`, bukan `latest`** — Postgres tidak bisa membaca
  direktori data dari versi mayor yang berbeda. `latest` suatu hari akan
  menolak menyala setelah pull rutin, dengan data yang utuh tapi tidak terbaca.
- **Batas ukuran log** — pino menulis JSON satu baris per event. Tanpa
  `max-size`, file-nya tumbuh sampai disk penuh.

### Perintah harian

```bash
docker compose logs -f api                       # ikuti log
docker compose exec api npm run migrate:status   # status migration
docker compose exec db psql -U spatial_app -d spatial_indonesia
docker compose restart api
docker compose down                              # berhenti, data tetap ada
docker compose down -v                           # ⚠ ikut menghapus volume
```

---

## 3. Cara B — Image saja, database dari penyedia lain

Untuk Railway, Fly.io, Render, atau Kubernetes, dengan Postgres dari Neon,
Supabase, atau RDS.

```bash
docker build -t spatial-backend:1.0.0 .

docker run -d --name spatial-api \
  -p 127.0.0.1:4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL='postgres://user:pass@host:5432/db?sslmode=require' \
  -e PGSSL=true \
  -e JWT_ACCESS_SECRET=… -e JWT_REFRESH_SECRET=… -e IP_HASH_SALT=… \
  -e COOKIE_SECURE=true \
  -e CORS_ORIGINS='https://spatialindonesia.id' \
  -e PUBLIC_URL='https://api.spatialindonesia.id' \
  -e TRUST_PROXY=1 \
  -v spatial-uploads:/app/uploads \
  spatial-backend:1.0.0
```

**Jalankan migration sebagai langkah terpisah**, bukan dari container
aplikasi — begitu ada lebih dari satu replika, semuanya akan mencoba
bermigrasi bersamaan saat deploy:

```bash
docker run --rm -e DATABASE_URL=… -e JWT_ACCESS_SECRET=… -e JWT_REFRESH_SECRET=… \
  -e IP_HASH_SALT=… spatial-backend:1.0.0 node scripts/migrate.js up
```

Migration dibungkus transaksi sehingga tabrakan tidak akan merusak data, tapi
job terpisah membuat kegagalannya terlihat sebagai deploy yang gagal — bukan
sebagai container yang restart berulang tanpa penjelasan.

> **Beri tag versi, jangan `latest`.** `latest` membuat rollback jadi
> tebak-tebakan: tidak ada yang tahu image mana yang tadi berjalan.

### Beri tahu platform-nya soal health check

Titiknya `GET /api/v1/health`. Endpoint ini **benar-benar menyentuh database** —
server yang hidup tapi kehilangan Postgres tidak akan dilaporkan sehat.

---

## 4. Reverse proxy, HTTPS, dan `TRUST_PROXY`

Node tidak melayani HTTPS sendiri. Letakkan nginx atau Caddy di depannya.

```nginx
server {
    listen 443 ssl http2;
    server_name api.spatialindonesia.id;

    ssl_certificate     /etc/letsencrypt/live/api.spatialindonesia.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.spatialindonesia.id/privkey.pem;

    # Upload dibatasi 4 MB di aplikasi. Batas nginx harus sedikit di atasnya —
    # kalau lebih kecil, penolakannya datang sebagai 413 dari nginx berupa
    # halaman HTML, bukan pesan JSON yang bisa dibaca dashboard.
    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # Tiga header ini yang membuat req.ip, req.protocol, dan URL absolut di
        # aplikasi menunjuk ke hal yang benar.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 70s;   # sedikit di atas requestTimeout server (60s)
    }
}

server {
    listen 80;
    server_name api.spatialindonesia.id;
    return 301 https://$host$request_uri;
}
```

Caddy melakukan hal yang sama dengan HTTPS otomatis:

```
api.spatialindonesia.id {
    reverse_proxy 127.0.0.1:4000
    request_body { max_size 6MB }
}
```

### Menghitung `TRUST_PROXY` dengan benar

Angka ini menentukan alamat mana di rantai `X-Forwarded-For` yang dipercaya
sebagai IP pengunjung. **Salah menghitungnya punya dua akibat yang sama-sama
buruk.**

| Nilai | Keadaan |
| --- | --- |
| `0` | Node langsung menghadap internet, tanpa proxy |
| `1` | Satu nginx / Caddy / load balancer |
| `2` | Cloudflare di depan nginx |

- Terlalu **kecil** → semua pengunjung terlihat berasal dari IP proxy. Satu
  jatah rate limit untuk seluruh dunia; satu bot bisa memblokir semua orang.
- Terlalu **besar** → klien bisa memalsukan IP-nya sendiri hanya dengan
  menambahkan header. Rate limit-nya jadi hiasan.

Cara memastikan setelah deploy: picu rate limit dari dua perangkat berbeda,
lalu lihat halaman **Monitoring → Sumber paling aktif**. Kalau keduanya muncul
sebagai satu hash yang sama, angkanya terlalu kecil.

---

## 5. Frontend

Frontend berupa file statis dan **tidak ada di dalam image ini**.

```bash
cd ..            # folder induk
node build.mjs   # menghasilkan dist/
```

Upload isi `dist/` ke hosting statis apa pun (Vercel, Netlify, nginx, S3). Dua
hal yang harus disesuaikan sebelum rilis:

1. **`<meta name="spatial-api">` di `index.html`** — arahkan ke domain API.
   Hapus meta-nya kalau API di-serve dari origin yang sama.
2. **`CORS_ORIGINS` di backend** — isi domain frontend. Origin yang tidak
   terdaftar akan ditolak 403, dan situsnya jatuh ke data bawaan tanpa error
   yang terlihat di layar.

> Cara tercepat memastikan sambungannya benar: buka DevTools → Network, cari
> `bootstrap`. Status `200` atau `304` berarti tersambung. `403`, atau
> `OPTIONS` tanpa `GET` sesudahnya, berarti origin-nya belum masuk whitelist.

---

## 6. Cara C — Tanpa Docker (systemd)

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin spatial
sudo -u spatial git clone <repo> /home/spatial/backend
cd /home/spatial/backend
sudo -u spatial npm ci --omit=dev
sudo -u spatial cp .env.example .env   # lalu isi
sudo -u spatial npm run migrate
sudo -u spatial npm run seed
```

`/etc/systemd/system/spatial-api.service`:

```ini
[Unit]
Description=Spatial Indonesia API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=spatial
WorkingDirectory=/home/spatial/backend
EnvironmentFile=/home/spatial/backend/.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

# Server sudah menutup koneksi dengan rapi saat menerima SIGTERM dan memaksa
# berhenti setelah 10 detik. 20 detik memberinya ruang tanpa menggantung deploy.
KillSignal=SIGTERM
TimeoutStopSec=20

# Pengerasan. Proses ini hanya perlu menulis ke satu folder.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/spatial/backend/uploads

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now spatial-api
sudo journalctl -u spatial-api -f
```

---

## 7. Update dan rollback

### Docker Compose

```bash
git pull
docker compose up -d --build          # migration jalan otomatis
docker compose logs -f api
```

### Rollback

```bash
docker compose down
git checkout <tag-sebelumnya>
docker compose up -d --build
```

**Rollback kode itu mudah; rollback skema tidak.** `npm run migrate:down`
membatalkan **satu** migration terakhir, dan itu memang disengaja — rollback
beruntun tanpa diminta adalah cara cepat kehilangan data production. Kalau
sebuah migration menghapus kolom, datanya sudah tidak ada dan `down` tidak akan
mengembalikannya. Untuk perubahan yang merusak, backup dulu.

> Mengedit migration yang sudah terpasang akan ditolak: checksum-nya dicatat.
> Bikin migration baru.

---

## 8. Backup

Yang perlu di-backup hanya dua: **database** dan **folder `uploads/`**. Tidak
ada state lain di mana pun.

```bash
# Database
docker compose exec -T db pg_dump -U spatial_app -Fc spatial_indonesia \
  > backup-$(date +%F).dump

# File upload
docker run --rm -v spatial-indonesia_uploads:/data -v "$PWD":/keluar alpine \
  tar czf /keluar/uploads-$(date +%F).tar.gz -C /data .
```

Restore:

```bash
docker compose exec -T db pg_restore -U spatial_app -d spatial_indonesia \
  --clean --if-exists < backup-2026-08-22.dump
```

Cron harian:

```cron
0 3 * * * cd /srv/spatial/backend && docker compose exec -T db \
  pg_dump -U spatial_app -Fc spatial_indonesia > /backup/si-$(date +\%F).dump
```

> **Backup yang belum pernah di-restore bukan backup.** Coba `pg_restore` ke
> database kosong sekali, sekarang, sebelum Anda benar-benar membutuhkannya.

`pg_dump` harus berasal dari versi mayor yang sama dengan server-nya — alasan
lain kenapa versi image dikunci.

---

## 9. Setelah menyala: enam pemeriksaan

```bash
API=https://api.spatialindonesia.id/api/v1

curl -s $API/health                                       # 1. database tersambung
curl -s -o /dev/null -w '%{http_code}\n' $API/bootstrap   # 2. 200
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Origin: https://jahat.example' $API/bootstrap        # 3. 403
curl -sI $API/health | grep -i strict-transport            # 4. HSTS ada
curl -s -o /dev/null -w '%{http_code}\n' $API/admin/users  # 5. 401
```

6. Masuk ke `/admin`, buka **Monitoring**, pastikan statusnya hijau dan cache
   hit ratio database di atas 95%.

Lalu **ganti password akun owner** lewat ikon gembok di topbar.

---

## 10. Kalau ada yang salah

| Gejala | Penyebab yang paling sering |
| --- | --- |
| Container restart terus | Migration gagal atau secret belum diisi. `docker compose logs api` — pesannya menyebut variabel mana |
| `Konfigurasi lingkungan tidak valid` | Variabel wajib kosong. Daftarnya tercetak lengkap di log |
| `502 Bad Gateway` | Container mati atau nginx menunjuk port yang salah. Cek `docker compose ps` |
| Frontend tampil tapi datanya bawaan | Origin ditolak CORS. Cek Network → `bootstrap` |
| `OPTIONS` ada, `GET` tidak menyusul | Header yang dipakai frontend tidak ada di `allowedHeaders` — gagal tanpa error di console |
| Semua pengunjung kena rate limit bersamaan | `TRUST_PROXY` terlalu kecil (§4) |
| Gambar admin hilang setelah deploy | Volume `uploads` tidak ter-mount |
| Login berhasil lalu langsung keluar lagi | `COOKIE_SECURE=true` tanpa HTTPS — browser membuang cookie-nya |
| Dashboard kosong tapi console bersih | Modul lama di cache tab. Buka tab baru |

Log-nya JSON terstruktur. Untuk membacanya:

```bash
docker compose logs api | grep '"level":50'      # error saja
docker compose logs api | jq 'select(.level>=50)'
```

Security event tidak hanya ada di log — semuanya tersimpan di tabel
`security_events` dan bisa dibaca di halaman **Monitoring**.

---

## 11. Ringkasan file Docker

| File | Isinya |
| --- | --- |
| `Dockerfile` | Build dua tahap, non-root, tini sebagai PID 1, health check ke `/api/v1/health` |
| `.dockerignore` | Menjaga `node_modules`, `.env`, `test/`, dan `uploads/` tetap di luar image |
| `docker-compose.yml` | Backend + Postgres, database tidak terekspos, volume untuk data |
| `docker/entrypoint.sh` | Menjalankan migration (opsional) lalu menyerahkan proses ke Node |
