#!/bin/sh
# Entrypoint container.
#
# Server menolak start kalau ada migrasi yang belum jalan (lihat src/server.js),
# jadi urutannya harus benar. Menjalankan migrasi di sini membuat `docker
# compose up` bekerja tanpa langkah manual.
#
# Tapi ia OPT-IN lewat RUN_MIGRATIONS, dan itu disengaja: kalau nanti backend
# dijalankan lebih dari satu replika, semuanya akan mencoba bermigrasi
# bersamaan saat deploy. Migrasi dibungkus transaksi sehingga tidak akan
# merusak apa pun, tapi jalur yang benar adalah menjalankannya sekali sebagai
# job terpisah dan membiarkan replikanya hanya menyala.
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "entrypoint: menjalankan migrasi…"
  node scripts/migrate.js up
fi

if [ "$RUN_SEED" = "true" ]; then
  echo "entrypoint: mengisi data awal…"
  node scripts/seed.js
fi

exec "$@"
