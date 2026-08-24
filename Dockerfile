# Image produksi backend Spatial Indonesia.
#
# Dua tahap. Tahap `deps` memasang dependensi dan menyimpan cache npm-nya;
# tahap `runtime` hanya menyalin hasilnya. Bedanya bukan sekadar ukuran akhir:
# selama package-lock.json tidak berubah, tahap pertama tidak dijalankan ulang,
# jadi menyunting satu berkas sumber tidak memicu `npm ci` selama satu menit.

# ── tahap 1: dependensi ─────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Hanya manifes yang disalin lebih dulu. Kalau seluruh sumber ikut di sini,
# setiap perubahan satu huruf di src/ akan membatalkan cache lapisan ini.
COPY package.json package-lock.json ./

# `npm ci`, bukan `npm install`: ia memasang persis versi di lockfile dan gagal
# kalau lockfile-nya tidak sinkron — build yang bisa diulang, bukan build yang
# kebetulan berhasil hari ini.
RUN npm ci --omit=dev && npm cache clean --force

# ── tahap 2: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

# tini jadi PID 1. Node memang punya penangan SIGTERM sendiri di src/server.js,
# tapi PID 1 juga bertugas memanen proses zombie — dan tanpa itu, container
# yang berumur panjang pelan-pelan mengumpulkan entri proses mati.
RUN apk add --no-cache tini

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules

# Hanya yang benar-benar dibaca saat runtime.
#   src      aplikasinya
#   db       migrasi — dijalankan entrypoint, dan server menolak start kalau
#            ada yang tertinggal
#   admin    dashboard, dilayani sebagai berkas statis
#   scripts  CLI migrasi dan seed
COPY package.json ./
COPY src ./src
COPY db ./db
COPY admin ./admin
COPY scripts ./scripts
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

# Folder unggahan harus ada sebelum multer menulis ke sana. Di produksi ia
# ditimpa volume; ini memastikan container tetap jalan kalau volumenya lupa
# dipasang — berkasnya hilang saat container diganti, tapi aplikasinya tidak
# gagal dengan ENOENT yang membingungkan.
RUN mkdir -p uploads \
    && chmod +x /usr/local/bin/entrypoint.sh \
    && chown -R node:node /app

# Tidak berjalan sebagai root. Kalau ada celah yang memungkinkan eksekusi
# perintah, ia mendarat sebagai pengguna tanpa hak apa pun.
USER node

EXPOSE 4000

# Health check menembak endpoint yang benar-benar menyentuh database — bukan
# sekadar memastikan portnya terbuka. Server yang hidup tapi kehilangan
# Postgres tidak layak disebut sehat.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "src/server.js"]
