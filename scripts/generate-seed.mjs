#!/usr/bin/env node
// Perakit db/seed.sql.
//
// Isi awal database ditarik langsung dari modul data frontend yang lama
// (../src/data/*.js), bukan disalin tangan. Enam artikel lengkap dengan
// belasan sparing terlalu banyak untuk diketik ulang tanpa salah satu huruf
// meleset, dan seed yang isinya beda tipis dari situs aslinya adalah cara
// halus untuk menghabiskan sore mencari perbedaan yang tidak penting.
//
// Skrip ini dijalankan sekali saat backend dibangun. Setelah data hidup di
// Postgres, sumber kebenarannya adalah database — bukan berkas ini lagi.
//
//   node scripts/generate-seed.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FE = new URL('../../src/data/', import.meta.url);
const { PLANETS, PLANET_ICONS } = await import(new URL('planets.js', FE));
const { ARTICLES, CATEGORIES, FREQ, SEED_SPARING } = await import(new URL('insight.js', FE));
const { AGENDA, PRESENCE } = await import(new URL('agenda.js', FE));

// ── perkakas SQL ────────────────────────────────────────────────────────────
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? 'NULL' : String(v));
const b = (v) => (v ? 'true' : 'false');
const arr = (list) => `ARRAY[${list.map(q).join(', ')}]::text[]`;
const hex = (int) => `#${int.toString(16).padStart(6, '0')}`;

const baris = [];
const tulis = (s = '') => baris.push(s);

// ── konten tujuh menu ───────────────────────────────────────────────────────
// Diambil dari panel <div data-panel="…"> di index.html — itu versi lengkapnya.
// PANELS di src/data/panels.js hanya ringkasan untuk panel di dalam headset,
// dan sekarang diturunkan dari data yang sama, bukan ditulis terpisah.
const MENUS = [
  {
    id: 'inti', kind: 'core', no: '00', tag: 'Inti', label: 'Inti — Visi & Misi', accent: '#9E94F9',
    title: 'Opening Access of Emerging Spatial Technology',
    lead: 'Teknologi spatial seharusnya bisa diakses siapa pun, dari mana pun di Indonesia. Itu titik awal kami.',
    items: [
      { k: '01', t: null, d: 'Membuat teknologi spatial lebih accessible bagi semua.' },
      { k: '02', t: null, d: 'Membangun kolaborasi untuk mendorong inovasi spatial.' },
      { k: '03', t: null, d: 'Mengembangkan talenta teknologi spatial masa depan.' },
      { k: '04', t: null, d: 'Menciptakan teknologi spatial yang meaningful dan berdampak.' }
    ]
  },
  {
    id: 'program', kind: 'planet', no: '01', tag: 'Program', label: 'Program', accent: '#a99bf2',
    title: 'Program & kegiatan',
    lead: 'Semua terbuka untuk publik. Tidak perlu headset sendiri untuk mulai ikut.',
    items: [
      { k: 'Bulanan', t: 'XR Meetup', d: 'Ngumpul santai: demo karya, sesi tanya jawab, dan coba perangkat bareng.' },
      { k: 'Belajar', t: 'Workshop & bootcamp', d: 'Kelas praktik dari nol: WebXR, Unity, three.js, sampai desain interaksi spatial.' },
      { k: 'Kolaborasi', t: 'Open Build', d: 'Bikin proyek bareng lintas disiplin, dari ide sampai rilis, dengan mentor komunitas.' },
      { k: 'Kampus', t: 'Kelas keliling', d: 'Membawa pengenalan teknologi spatial ke kampus dan sekolah di berbagai kota.' }
    ]
  },
  {
    id: 'karya', kind: 'planet', no: '02', tag: 'Karya', label: 'Karya', accent: '#9E94F9',
    title: 'Karya member',
    lead: 'Proyek VR, AR, dan XR yang dibangun oleh member komunitas.',
    items: [
      { k: 'VR · Edukasi', t: 'Judul proyek', d: 'Deskripsi singkat dan nama member pembuatnya.' },
      { k: 'AR · Budaya', t: 'Judul proyek', d: 'Deskripsi singkat dan nama member pembuatnya.' },
      { k: 'XR · Industri', t: 'Judul proyek', d: 'Deskripsi singkat dan nama member pembuatnya.' }
    ]
  },
  {
    // Tidak punya menu_items: isinya dirakit dari tabel agenda_events, sama
    // seperti panelnya di index.html yang cuma wadah [data-agenda-list].
    id: 'event', kind: 'planet', no: '03', tag: 'Event', label: 'Event', accent: '#f3f2f8',
    title: 'Event & meetup',
    lead: 'Jadwal terdekat. Klik untuk daftar lewat planet Gabung.',
    items: []
  },
  {
    // Sama: isinya daftar artikel dari tabel articles.
    id: 'insight', kind: 'planet', no: '04', tag: 'Insight', label: 'Insight', accent: '#9E94F9',
    title: 'Sistem Insight',
    lead: 'Tiap tulisan adalah satu bulan yang mengorbit planet ini.',
    items: []
  },
  {
    id: 'tim', kind: 'planet', no: '05', tag: 'Tim', label: 'Tim', accent: '#f3f2f8',
    title: 'Tim inti',
    lead: 'Relawan yang menjaga ritme komunitas.',
    items: [
      { k: '01', t: 'Nama', d: 'Peran' },
      { k: '02', t: 'Nama', d: 'Peran' },
      { k: '03', t: 'Nama', d: 'Peran' },
      { k: '04', t: 'Nama', d: 'Peran' }
    ]
  },
  {
    id: 'gabung', kind: 'planet', no: '06', tag: 'Gabung', label: 'Gabung', accent: '#9E94F9',
    title: 'Ikut bangun ruangnya',
    lead: 'Kami senang kenalan dengan orang baru. Isi datanya, kami hubungi untuk kegiatan terdekat.',
    items: [
      { k: 'Langkah', t: 'Isi form pendaftaran', d: 'Gratis dan terbuka untuk semua level, tidak wajib punya headset, dari kota mana pun.' },
      { k: 'Kanal', t: 'Sapa lebih dulu', d: 'Instagram, Discord, atau LinkedIn kalau mau kenalan sebelum datang.' }
    ],
    links: [
      { label: 'Instagram', url: 'https://instagram.com/' },
      { label: 'Discord', url: 'https://discord.com/' },
      { label: 'LinkedIn', url: 'https://linkedin.com/' }
    ]
  }
];

// Parameter orbit diambil dari PLANETS supaya angka di database persis sama
// dengan yang selama ini dipakai scene — tata letaknya tidak boleh bergeser
// hanya karena sumber datanya pindah.
const planetOf = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

// ── blok artikel → HTML ─────────────────────────────────────────────────────
// Reader yang baru merender HTML, jadi bentuk lama {h, p[], q} diterjemahkan
// sekali di sini. `q` jadi <blockquote>, bukan atribut terpisah — begitu
// artikel disunting lewat WYSIWYG, kutipan memang hanya sebuah blockquote.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const blokKeHtml = (body) =>
  body
    .map((blok) => {
      const bagian = [];
      if (blok.h) bagian.push(`<h2>${esc(blok.h)}</h2>`);
      for (const p of blok.p || []) bagian.push(`<p>${esc(p)}</p>`);
      if (blok.q) bagian.push(`<blockquote><p>${esc(blok.q)}</p></blockquote>`);
      return bagian.join('\n');
    })
    .join('\n');

// ── rakit ───────────────────────────────────────────────────────────────────
tulis(`-- db/seed.sql — isi awal database Spatial Indonesia.
--
-- DIBANGKITKAN OLEH scripts/generate-seed.mjs — jangan disunting tangan.
-- Sumbernya modul data frontend (src/data/*.js) dan panel di index.html.
--
-- Aman dijalankan berulang: setiap tabel konten dikosongkan dulu. Tabel
-- admin_users, admin_sessions, audit_logs, dan join_submissions TIDAK
-- disentuh — akun dan kiriman orang tidak boleh hilang karena seed diulang.
--
--   psql "$DATABASE_URL" -f db/seed.sql
--   atau: npm run seed   (sekalian memastikan akun admin pertama ada)

BEGIN;

TRUNCATE TABLE sparings, articles, article_categories, sparing_frequencies,
               menu_links, menu_items, menus, agenda_events, presence_visits,
               site_settings
  RESTART IDENTITY CASCADE;
`);

tulis('-- ── kategori artikel ────────────────────────────────────────────────────');
tulis('INSERT INTO article_categories (id, label, color, position) VALUES');
tulis(
  Object.entries(CATEGORIES)
    .map(([id, c], i) => `  (${q(id)}, ${q(c.label)}, ${q(c.color)}, ${i + 1})`)
    .join(',\n') + ';'
);
tulis();

tulis('-- ── frekuensi sparing ───────────────────────────────────────────────────');
tulis('INSERT INTO sparing_frequencies (id, label, glyph, color, hint, position) VALUES');
tulis(
  Object.values(FREQ)
    .map((f, i) => `  (${q(f.id)}, ${q(f.label)}, ${q(f.glyph)}, ${q(f.color)}, ${q(f.hint)}, ${i + 1})`)
    .join(',\n') + ';'
);
tulis();

tulis('-- ── tujuh menu ──────────────────────────────────────────────────────────');
tulis(`INSERT INTO menus
  (id, kind, position, label, no, tag, accent, title, lead,
   orbit, size, color, speed, phase, tilt, skin, has_ring,
   icon_file, icon_from, icon_to) VALUES`);
tulis(
  MENUS.map((m, i) => {
    const p = planetOf[m.id];
    const ic = PLANET_ICONS[m.id];
    return `  (${q(m.id)}, ${q(m.kind)}, ${i}, ${q(m.label)}, ${q(m.no)}, ${q(m.tag)}, ${q(m.accent)},
   ${q(m.title)},
   ${q(m.lead)},
   ${n(p?.orbit)}, ${n(p?.size)}, ${n(p?.color)}, ${n(p?.speed)}, ${n(p?.phase)}, ${n(p?.tilt)}, ${q(p?.skin)}, ${b(p?.ring)},
   ${q(ic.file)}, ${q(ic.from)}, ${q(ic.to)})`;
  }).join(',\n') + ';'
);
tulis();

const items = MENUS.flatMap((m) => m.items.map((it, i) => ({ menu: m.id, pos: i, ...it })));
tulis('INSERT INTO menu_items (menu_id, position, k, t, d) VALUES');
tulis(items.map((it) => `  (${q(it.menu)}, ${it.pos}, ${q(it.k)}, ${q(it.t)}, ${q(it.d)})`).join(',\n') + ';');
tulis();

const links = MENUS.flatMap((m) => (m.links || []).map((l, i) => ({ menu: m.id, pos: i, ...l })));
tulis('INSERT INTO menu_links (menu_id, position, label, url) VALUES');
tulis(links.map((l) => `  (${q(l.menu)}, ${l.pos}, ${q(l.label)}, ${q(l.url)})`).join(',\n') + ';');
tulis();

tulis('-- ── artikel ─────────────────────────────────────────────────────────────');
tulis(`-- Semua artikel bawaan berjenis 'internal' (dibaca di situs ini). Untuk
-- artikel yang cuma melempar ke Medium, isi source='medium' dan external_url —
-- body_html boleh kosong dan tidak akan dipakai.`);
tulis(`INSERT INTO articles
  (slug, no, category_id, title, lead, author, source, body_html, read_minutes, status, published_at) VALUES`);
tulis(
  ARTICLES.map((a) => {
    const html = blokKeHtml(a.body);
    return `  (${q(a.slug)}, ${q(a.no)}, ${q(a.cat)}, ${q(a.title)},
   ${q(a.lead)},
   ${q(a.author)}, 'internal',
   ${q(html)},
   ${n(a.read)}, 'published', ${q(`${a.date} 05:00:00+00`)})`;
  }).join(',\n') + ';'
);
tulis();

tulis('-- ── sparing (sudah disetujui, supaya cincin artikel tidak kosong) ───────');
const sparings = Object.entries(SEED_SPARING).flatMap(([slug, list]) =>
  list.map((s) => ({ slug, ...s }))
);
tulis(`INSERT INTO sparings (article_id, frequency_id, author_name, body, anchor_x, anchor_y, boost, status, created_at)
SELECT a.id, v.freq, v.nama, v.isi, v.ax, v.ay, v.boost, 'approved', v.at
FROM (VALUES`);
tulis(
  sparings
    .map(
      (s) =>
        `  (${q(s.slug)}, ${q(s.freq)}, ${q(s.name)}, ${q(s.text)}, ${s.anchor[0]}::smallint, ${s.anchor[1]}::smallint, ${s.boost}, ${q(`${s.at} 05:00:00+00`)}::timestamptz)`
    )
    .join(',\n')
);
tulis(') AS v(slug, freq, nama, isi, ax, ay, boost, at)');
tulis('JOIN articles a ON a.slug = v.slug;');
tulis();

tulis('-- ── agenda ──────────────────────────────────────────────────────────────');
tulis(`-- Jarak sudut planet Event ke Titik Temu dihitung dari acara terdekat di
-- tabel ini, jadi menambah atau menghapus baris di sini benar-benar memindahkan
-- planetnya di layar.`);
tulis('INSERT INTO agenda_events (id, kind, title, event_date, place, note) VALUES');
tulis(
  AGENDA.map((a) => `  (${q(a.id)}, ${q(a.kind)}, ${q(a.title)}, ${q(a.date)}, ${q(a.place)}, ${q(a.note)})`).join(
    ',\n'
  ) + ';'
);
tulis();

tulis('-- ── jejak kehadiran contoh ──────────────────────────────────────────────');
tulis(`-- Diberi stempel waktu relatif terhadap saat seed dijalankan supaya jejaknya
-- selalu tampak "baru saja" — kalau ditulis absolut, minggu depan lintasannya
-- semua tampil redup dan fitur ini jadi terlihat rusak.`);
tulis('INSERT INTO presence_visits (path, created_at) VALUES');
tulis(
  PRESENCE.map((p) => `  (${arr(p.path)}, now() - interval '${p.ago} minutes')`).join(',\n') + ';'
);
tulis();

tulis('-- ── pengaturan situs ────────────────────────────────────────────────────');
tulis(`INSERT INTO site_settings (key, value) VALUES
  ('insight.fresh_days', '30'::jsonb),
  ('insight.sparing_moderation', 'true'::jsonb),
  ('presence.limit', '12'::jsonb),
  ('site.name', '"Spatial Indonesia"'::jsonb),
  ('site.tagline', '"Opening Access of Emerging Spatial Technology"'::jsonb);`);
tulis();
tulis('COMMIT;');
tulis();

const out = fileURLToPath(new URL('../db/seed.sql', import.meta.url));
await writeFile(out, baris.join('\n'), 'utf8');
console.log(`db/seed.sql ditulis — ${MENUS.length} menu, ${items.length} butir, ${ARTICLES.length} artikel, ${sparings.length} sparing, ${AGENDA.length} agenda.`);
