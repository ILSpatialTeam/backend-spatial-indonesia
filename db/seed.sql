-- db/seed.sql — isi awal database Spatial Indonesia.
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

-- ── kategori artikel ────────────────────────────────────────────────────
INSERT INTO article_categories (id, label, color, position) VALUES
  ('teknis', 'Teknis', '#9E94F9', 1),
  ('desain', 'Desain', '#a99bf2', 2),
  ('industri', 'Industri', '#5ad1c0', 3),
  ('cerita', 'Cerita member', '#f3f2f8', 4);

-- ── frekuensi sparing ───────────────────────────────────────────────────
INSERT INTO sparing_frequencies (id, label, glyph, color, hint, position) VALUES
  ('sinyal', 'Sinyal', '▲', '#9E94F9', 'Menambah informasi, rujukan, atau data yang belum ada di tulisan.', 1),
  ('observasi', 'Observasi', '◆', '#5ad1c0', 'Pengalaman langsung atau studi kasus dari pekerjaanmu sendiri.', 2),
  ('sonde', 'Sonde', '●', '#f3f2f8', 'Pertanyaan untuk penulis atau untuk pembaca lain.', 3),
  ('anomali', 'Anomali', '✦', '#f2a65a', 'Sudut pandang berbeda atau sanggahan. Orbitnya sengaja dibuat miring.', 4);

-- ── tujuh menu ──────────────────────────────────────────────────────────
INSERT INTO menus
  (id, kind, position, label, no, tag, accent, title, lead,
   orbit, size, color, speed, phase, tilt, skin, has_ring,
   icon_file, icon_from, icon_to) VALUES
  ('inti', 'core', 0, 'Inti — Visi & Misi', '00', 'Inti', '#9E94F9',
   'Opening Access of Emerging Spatial Technology',
   'Teknologi spatial seharusnya bisa diakses siapa pun, dari mana pun di Indonesia. Itu titik awal kami.',
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, false,
   'icon-1', '#cfc9ff', '#6a5ae0'),
  ('program', 'planet', 1, 'Program', '01', 'Program', '#a99bf2',
   'Program & kegiatan',
   'Semua terbuka untuk publik. Tidak perlu headset sendiri untuk mulai ikut.',
   11, 0.7, 11115506, 0.085, 0.4, 0.03, 'mercury', false,
   'icon-4', '#e0dbff', '#8b7ff0'),
  ('karya', 'planet', 2, 'Karya', '02', 'Karya', '#9E94F9',
   'Karya member',
   'Proyek VR, AR, dan XR yang dibangun oleh member komunitas.',
   15.5, 0.98, 6970080, 0.062, 2.1, 0.05, 'venus', false,
   'icon-3', '#c3baff', '#5f4fd8'),
  ('event', 'planet', 3, 'Event', '03', 'Event', '#f3f2f8',
   'Event & meetup',
   'Jadwal terdekat. Klik untuk daftar lewat planet Gabung.',
   20, 1.02, 15987448, 0.048, 4, 0.41, 'earth', false,
   'icon-6', '#ffffff', '#a9a3c4'),
  ('insight', 'planet', 4, 'Insight', '04', 'Insight', '#9E94F9',
   'Sistem Insight',
   'Tiap tulisan adalah satu bulan yang mengorbit planet ini.',
   25, 0.8, 2760649, 0.038, 5.4, 0.44, 'mars', false,
   'icon-5', '#c2bbff', '#4b3ce0'),
  ('tim', 'planet', 5, 'Tim', '05', 'Tim', '#f3f2f8',
   'Tim inti',
   'Relawan yang menjaga ritme komunitas.',
   30, 1.5, 15987448, 0.03, 1.2, 0.05, 'jupiter', false,
   'icon-2', '#ffffff', '#b5aed0'),
  ('gabung', 'planet', 6, 'Gabung', '06', 'Gabung', '#9E94F9',
   'Ikut bangun ruangnya',
   'Kami senang kenalan dengan orang baru. Isi datanya, kami hubungi untuk kegiatan terdekat.',
   35.5, 1.3, 6970080, 0.024, 3.3, 0.47, 'saturn', true,
   'icon-7', '#d6d0ff', '#6a5ae0');

INSERT INTO menu_items (menu_id, position, k, t, d) VALUES
  ('inti', 0, '01', NULL, 'Membuat teknologi spatial lebih accessible bagi semua.'),
  ('inti', 1, '02', NULL, 'Membangun kolaborasi untuk mendorong inovasi spatial.'),
  ('inti', 2, '03', NULL, 'Mengembangkan talenta teknologi spatial masa depan.'),
  ('inti', 3, '04', NULL, 'Menciptakan teknologi spatial yang meaningful dan berdampak.'),
  ('program', 0, 'Bulanan', 'XR Meetup', 'Ngumpul santai: demo karya, sesi tanya jawab, dan coba perangkat bareng.'),
  ('program', 1, 'Belajar', 'Workshop & bootcamp', 'Kelas praktik dari nol: WebXR, Unity, three.js, sampai desain interaksi spatial.'),
  ('program', 2, 'Kolaborasi', 'Open Build', 'Bikin proyek bareng lintas disiplin, dari ide sampai rilis, dengan mentor komunitas.'),
  ('program', 3, 'Kampus', 'Kelas keliling', 'Membawa pengenalan teknologi spatial ke kampus dan sekolah di berbagai kota.'),
  ('karya', 0, 'VR · Edukasi', 'Judul proyek', 'Deskripsi singkat dan nama member pembuatnya.'),
  ('karya', 1, 'AR · Budaya', 'Judul proyek', 'Deskripsi singkat dan nama member pembuatnya.'),
  ('karya', 2, 'XR · Industri', 'Judul proyek', 'Deskripsi singkat dan nama member pembuatnya.'),
  ('tim', 0, '01', 'Nama', 'Peran'),
  ('tim', 1, '02', 'Nama', 'Peran'),
  ('tim', 2, '03', 'Nama', 'Peran'),
  ('tim', 3, '04', 'Nama', 'Peran'),
  ('gabung', 0, 'Langkah', 'Isi form pendaftaran', 'Gratis dan terbuka untuk semua level, tidak wajib punya headset, dari kota mana pun.'),
  ('gabung', 1, 'Kanal', 'Sapa lebih dulu', 'Instagram, Discord, atau LinkedIn kalau mau kenalan sebelum datang.');

INSERT INTO menu_links (menu_id, position, label, url) VALUES
  ('gabung', 0, 'Instagram', 'https://instagram.com/'),
  ('gabung', 1, 'Discord', 'https://discord.com/'),
  ('gabung', 2, 'LinkedIn', 'https://linkedin.com/');

-- ── artikel ─────────────────────────────────────────────────────────────
-- Semua artikel bawaan berjenis 'internal' (dibaca di situs ini). Untuk
-- artikel yang cuma melempar ke Medium, isi source='medium' dan external_url —
-- body_html boleh kosong dan tidak akan dipakai.
INSERT INTO articles
  (slug, no, category_id, title, lead, author, source, body_html, read_minutes, status, published_at) VALUES
  ('frame-budget-vr', '001', 'teknis', 'Kenapa 72 FPS Jadi Garis Hidup di VR',
   'Di layar biasa, frame drop bikin animasi tersendat. Di headset, frame drop bikin orang muntah. Ini isi anggaran 13,8 milidetik itu.',
   'Tim Spatial Indonesia', 'internal',
   '<h2>Anggaranmu 13,8 milidetik, bukan 16</h2>
<p>Pada 72 Hz, satu frame harus selesai dalam 13,8 ms. Angka itu bukan target rata-rata, tapi plafon keras: satu frame saja lewat, headset akan menampilkan ulang frame lama, dan pengguna merasakannya sebagai sentakan di seluruh dunia — bukan hanya pada objek yang bergerak.</p>
<p>Dan 13,8 ms itu belum sepenuhnya milikmu. Compositor, reprojection, dan pembacaan sensor sudah mengambil bagiannya lebih dulu. Anggap saja kamu punya sekitar 10 ms untuk logika, animasi, dan render dua mata sekaligus.</p>
<h2>Yang bikin mual bukan grafis jelek</h2>
<p>Motion sickness di VR hampir selalu berasal dari ketidakcocokan antara apa yang dilihat mata dan apa yang dirasakan telinga dalam. Frame yang telat memperbesar latensi gerak kepala, dan otak membaca itu sebagai racun.</p>
<p>Konsekuensinya jelas dan sering diabaikan: menurunkan kualitas tekstur, mematikan bayangan real-time, atau menyederhanakan model selalu merupakan pilihan yang lebih baik daripada mempertahankan visual cantik pada 55 FPS. Karya yang indah tapi bikin pusing tidak akan ditonton sampai selesai.</p>
<blockquote><p>Tidak ada satu pun keputusan artistik yang layak dibayar dengan frame rate.</p></blockquote>
<h2>Empat pembunuh frame yang paling sering ketemu</h2>
<p>Pertama, draw call. Setiap material unik memaksa satu panggilan gambar, dan dua mata berarti hampir dua kali lipat. Gabungkan material, pakai atlas tekstur, dan gunakan instancing untuk objek berulang.</p>
<p>Kedua, overdraw dari transparansi. Partikel, kabut, dan panel kaca yang saling menumpuk memaksa GPU menggambar piksel yang sama berkali-kali. Ini penyebab nomor satu yang tidak terlihat di profiler kalau kamu hanya melihat jumlah segitiga.</p>
<p>Ketiga, alokasi memori per frame di dalam update loop. Garbage collector yang jalan di tengah sesi menghasilkan hitch yang persis terasa seperti sentakan. Buat pool, jangan buat objek baru tiap frame.</p>
<p>Keempat, resolusi render yang tidak sesuai. Banyak orang lupa bahwa headset merender lebih besar dari resolusi panel untuk menutupi distorsi lensa. Turunkan render scale sedikit dan kamu sering mendapat 20% performa gratis tanpa ada yang menyadarinya.</p>
<h2>Ukur dulu, jangan menebak</h2>
<p>Sebelum mengoptimasi apa pun, tentukan dulu kamu terikat pada CPU atau GPU. Kalau menurunkan resolusi render tidak mengubah frame time, masalahmu ada di CPU dan mengecilkan tekstur tidak akan menolong sama sekali.</p>
<p>Di WebXR, mulai dari `renderer.info` untuk jumlah draw call dan segitiga, lalu naik ke timer GPU lewat ekstensi disjoint timer query kalau tersedia. Di Quest, gunakan OVR Metrics Tool untuk melihat stale frame secara langsung di headset — angka itu jauh lebih jujur daripada FPS rata-rata.</p>
<h2>Kalau tetap tidak cukup</h2>
<p>Ada dua jalan keluar yang sah. Foveated rendering menurunkan resolusi di tepi pandangan, tempat mata memang tidak tajam, dan hampir selalu gratis secara persepsi. Fixed foveation level 2 adalah tombol pertama yang harus kamu tekan.</p>
<p>Jalan kedua adalah mengurangi ambisi adegan. Ruang yang lebih kecil, jumlah objek yang lebih sedikit, dan pencahayaan yang di-bake sejak awal bukan tanda menyerah — itu keputusan desain yang sadar bahwa medianya punya batas fisik.</p>',
   6, 'published', '2026-07-28 05:00:00+00'),
  ('antarmuka-tanpa-sentuh', '002', 'desain', 'Antarmuka yang Tidak Bisa Disentuh',
   'Semua kebiasaan desain layar patah begitu tombolnya melayang di udara. Catatan tentang zona nyaman, ukuran target, dan umpan balik tanpa permukaan.',
   'Tim Spatial Indonesia', 'internal',
   '<h2>Zona nyamannya jauh lebih sempit dari dugaanmu</h2>
<p>Bidang pandang manusia memang lebar, tapi wilayah tempat orang bisa membaca dan menekan sesuatu tanpa memutar kepala jauh lebih kecil: kira-kira 60 derajat horizontal dan 40 derajat vertikal dari arah pandang netral.</p>
<p>Untuk tangan, batasnya lebih ketat lagi. Apa pun yang menuntut lengan terangkat di atas bahu lebih dari beberapa detik akan menghasilkan gorilla arm. Letakkan kontrol utama setinggi dada, sedikit di bawah garis mata, dalam jarak 0,5 sampai 0,8 meter.</p>
<h2>Fitts’ Law tetap berlaku, dengan ongkos tambahan</h2>
<p>Waktu untuk menunjuk sesuatu tetap ditentukan oleh jarak dan ukuran target. Bedanya, di ruang tiga dimensi tanganmu tidak punya meja untuk bersandar, sehingga setiap gerakan membawa getaran alami.</p>
<p>Aturan praktis yang bertahan: target interaktif minimal 2 derajat sudut pandang, idealnya 3. Pada jarak 1 meter itu berarti tombol selebar sekitar 3,5 sampai 5 cm. Beri jarak antar target minimal setengah lebar target — salah tekan di udara jauh lebih menjengkelkan daripada salah tap di ponsel.</p>
<h2>Teks punya aturannya sendiri</h2>
<p>Teks di headset dibatasi resolusi sudut, bukan ukuran piksel. Yang perlu kamu jaga adalah tinggi huruf dalam derajat: di bawah 0,4 derajat, teks mulai berpendar dan sulit dibaca meski panelnya besar.</p>
<p>Praktik yang aman: tempatkan panel teks pada jarak tetap 1 sampai 2 meter, jangan lebih dekat dari 0,5 meter karena mata harus bekerja keras untuk konvergensi, dan hindari teks tipis. Berat huruf medium terbaca jauh lebih baik daripada light di semua headset yang ada sekarang.</p>
<h2>Tanpa permukaan, umpan balik jadi wajib</h2>
<p>Jari yang menekan tombol nyata mendapat perlawanan. Di udara, tidak ada apa-apa. Kalau kamu tidak menggantinya, orang akan menekan dua kali, ragu, lalu menyalahkan dirinya sendiri.</p>
<p>Gantikan dengan tiga lapis sekaligus: perubahan visual saat pointer masuk area, getaran singkat 10 sampai 20 ms saat menekan, dan bunyi klik pendek. Ketiganya harus terjadi dalam 50 ms setelah aksi, atau hubungan sebab-akibatnya hilang.</p>
<blockquote><p>Kalau pengguna menekan dua kali, itu bukan kesalahan mereka. Itu tanda umpan balikmu terlambat.</p></blockquote>
<h2>Daftar periksa singkat</h2>
<p>Apakah semua kontrol utama terjangkau tanpa mengangkat lengan di atas bahu? Apakah target terkecilmu masih 2 derajat pada jarak terjauh yang mungkin? Apakah setiap aksi punya umpan balik visual, haptic, dan audio? Apakah teksmu terbaca oleh orang yang memakai kacamata di dalam headset?</p>
<p>Kalau ada satu saja jawaban tidak, perbaiki itu sebelum menambah fitur baru. Antarmuka spatial jarang gagal karena kurang fitur; hampir selalu karena melelahkan dipakai lebih dari sepuluh menit.</p>',
   7, 'published', '2026-07-19 05:00:00+00'),
  ('webxr-jalan-tercepat', '003', 'industri', 'WebXR: Jalan Tercepat Masuk Spatial dari Indonesia',
   'Hambatan terbesar bukan harga headset, tapi jarak antara karyamu dan orang yang mau melihatnya. Browser memangkas jarak itu jadi satu tautan.',
   'Tim Spatial Indonesia', 'internal',
   '<h2>Masalahnya distribusi, bukan perangkat</h2>
<p>Membangun aplikasi VR native berarti meminta orang membuat akun toko, mengunduh beberapa ratus megabita, dan menunggu proses peninjauan sebelum karyamu bisa dilihat siapa pun. Untuk komunitas yang sedang tumbuh, itu tiga lapis gesekan yang mematikan momentum.</p>
<p>WebXR memangkas semuanya jadi satu tautan yang bisa dikirim lewat WhatsApp. Orang membukanya di ponsel dan langsung mendapat versi AR; membukanya di headset dan langsung masuk mode imersif. Tidak ada pemasangan, tidak ada peninjauan.</p>
<h2>Yang sudah bisa dilakukan hari ini</h2>
<p>Sesi imersif VR dan AR, pelacakan enam derajat kebebasan, controller dan pelacakan tangan, hit test untuk menempatkan objek di lantai nyata, anchor, depth sensing di sebagian perangkat, dan light estimation. Untuk sebagian besar karya komunitas, ini sudah lebih dari cukup.</p>
<p>Ekosistem pustakanya juga matang. three.js menangani WebXR dengan baik, dan bila kamu ingin lebih deklaratif ada beberapa lapisan di atasnya. Yang penting: kamu memakai keterampilan web yang sudah dimiliki banyak orang di Indonesia, bukan memulai dari nol.</p>
<h2>Yang masih belum ada</h2>
<p>Performa puncaknya tetap di bawah native, terutama untuk adegan besar dengan banyak material. Dukungan Safari di iOS masih tertinggal, sehingga jalur AR untuk pengguna iPhone biasanya lewat Quick Look dengan format USDZ, bukan WebXR.</p>
<p>Akses ke fitur perangkat kelas atas — pelacakan mata penuh, passthrough kamera mentah — juga masih terbatas karena alasan privasi. Kalau karyamu bergantung pada itu, web belum jadi rumahnya.</p>
<h2>Kenapa ini penting untuk kita</h2>
<p>Sebagian besar calon pengguna karya spatial di Indonesia tidak punya headset dan tidak akan membelinya tahun ini. Tapi hampir semuanya punya ponsel Android yang mampu menjalankan AR di browser.</p>
<p>Artinya, karya yang dibangun di web bisa dinikmati sekarang oleh guru, kurator museum, mahasiswa, dan calon klien — bukan hanya oleh sesama pemilik headset. Itu perbedaan antara komunitas yang berbicara ke dalam dan komunitas yang tumbuh.</p>',
   5, 'published', '2026-07-05 05:00:00+00'),
  ('occlusion-ar-palsu', '004', 'teknis', 'Occlusion: Alasan AR-mu Terasa Palsu',
   'Objek virtual yang tetap terlihat saat berada di balik meja langsung mematahkan ilusi. Ini pilihan-pilihan yang kamu punya, dengan ongkosnya masing-masing.',
   'Tim Spatial Indonesia', 'internal',
   '<h2>Otak memeriksa oklusi lebih dulu</h2>
<p>Dari semua isyarat kedalaman yang dipakai manusia — bayangan, perspektif, ukuran relatif, paralaks — oklusi adalah yang paling kuat dan paling cepat diproses. Kalau sebuah objek menutupi objek lain, otak menyimpulkan objek itu berada di depan. Tidak ada isyarat lain yang bisa mengalahkannya.</p>
<p>Karena itu, model AR yang detail dan pencahayaannya sempurna tetap akan terasa seperti stiker kalau dia menembus kursi. Sebaliknya, model sederhana yang teroklusi dengan benar langsung terasa berada di ruangan.</p>
<h2>Tiga cara mendapatkannya</h2>
<p>Cara pertama, geometri proxy. Kamu membuat bentuk kasar untuk benda nyata — bidang lantai, kotak untuk meja — lalu merendernya hanya ke depth buffer tanpa warna. Murah, stabil, dan cocok untuk ruang yang kamu kendalikan seperti panggung pameran.</p>
<p>Cara kedua, rekonstruksi mesh ruangan. Perangkat memindai lingkungan dan memberimu mesh yang bisa dipakai sebagai occluder. Akurat untuk benda besar dan diam, tapi butuh waktu pemindaian dan tidak mengikuti benda yang berpindah.</p>
<p>Cara ketiga, depth map per frame dari sensor atau estimasi. Paling dinamis, satu-satunya yang bisa menangani tangan dan orang yang berjalan lewat.</p>
<h2>Depth API dan batasnya</h2>
<p>Peta kedalaman yang kamu terima biasanya jauh lebih kasar dari resolusi kamera, sering di kisaran 160 kali 90, dan datang dengan derau di tepi objek. Kalau dipakai mentah, siluet benda virtual akan bergetar setiap frame.</p>
<p>Perbaikannya bukan menaikkan resolusi, tapi memperhalus keputusan: buat transisi lembut di sekitar ambang kedalaman alih-alih pemotongan keras, dan tapis nilai kedalaman antar frame supaya tidak melompat. Sedikit kabur di tepi jauh lebih tidak mengganggu daripada tepi yang berkedip.</p>
<h2>Bayangan mengerjakan setengah sisanya</h2>
<p>Setelah oklusi benar, hal berikutnya yang paling terasa adalah bayangan kontak — bayangan gelap kecil tepat di titik objek menyentuh permukaan. Tanpa itu, benda tampak melayang beberapa sentimeter di atas lantai.</p>
<p>Bayangan kontak tidak perlu akurat secara fisika. Sebuah lingkaran gelap dengan tepi lembut, diskalakan menurut jarak objek ke permukaan, sudah menghasilkan sembilan puluh persen efeknya dengan ongkos yang hampir nol.</p>
<h2>Kompromi yang layak diambil</h2>
<p>Kalau perangkat targetmu tidak punya sensor kedalaman, jangan memaksakan estimasi berat yang memakan frame budget. Pilih pendekatan proxy, batasi area penempatan ke bidang datar yang terdeteksi, dan rancang adegan supaya benda virtual jarang berada di belakang benda nyata.</p>
<p>Membatasi ruang masalah adalah teknik yang sah. Karya AR terbaik yang pernah saya lihat di lapangan bukan yang paling canggih secara teknis, tapi yang paling tahu di mana harus berhenti.</p>',
   8, 'published', '2026-06-22 05:00:00+00'),
  ('skala-borobudur-vr', '005', 'cerita', 'Menjaga Skala: Catatan dari Membuat Candi di VR',
   'Modelnya sudah benar sejak awal. Yang salah adalah ukurannya — dan butuh tiga kali uji coba sebelum saya sadar itu bukan soal angka.',
   'Member komunitas', 'internal',
   '<h2>Kesalahan pertama: model tidak dalam meter</h2>
<p>Saya menerima aset dari pemindaian fotogrametri dengan satuan yang tidak jelas. Di viewport semuanya terlihat masuk akal, jadi saya lanjut. Begitu masuk headset, stupa setinggi tiga meter terasa seperti mainan setinggi lutut.</p>
<p>Pelajaran yang sekarang jadi kebiasaan: hal pertama yang saya lakukan pada aset baru adalah menaruh silinder setinggi 1,7 meter di sebelahnya. Kalau proporsinya salah, saya akan tahu dalam tiga detik, bukan tiga hari.</p>
<h2>Manusia adalah satuan ukur</h2>
<p>Di layar, skala itu relatif dan otak menerima apa saja. Di VR, tubuhmu jadi penggaris yang tidak bisa dibohongi. Tinggi mata, jangkauan tangan, dan lebar bahu semuanya ikut menilai.</p>
<p>Sejak itu, setiap adegan yang saya bangun selalu punya satu benda referensi berukuran manusia yang terlihat sejak awal — anak tangga, pintu, pagar. Bukan untuk dekorasi, tapi untuk memberi mata titik jangkar.</p>
<h2>Ketika ruang aslinya lebih besar dari ruang tamu</h2>
<p>Kompleks candi ratusan meter tidak bisa dijelajahi dengan berjalan kaki di ruangan 3 kali 3 meter. Saya mencoba teleportasi, dan kehilangan seluruh rasa jarak — orang tiba di puncak tanpa merasa menempuh apa pun.</p>
<p>Yang akhirnya berhasil adalah kombinasi: berjalan kaki nyata untuk area kecil yang penuh detail, ditambah perpindahan antar teras yang sengaja diberi jeda dan perubahan suara. Rasa "naik" ternyata lebih banyak dibawa oleh audio dan waktu tunggu daripada oleh jarak yang ditempuh.</p>
<blockquote><p>Orang tidak mengingat berapa meter yang mereka tempuh. Mereka mengingat berapa lama rasanya.</p></blockquote>
<h2>Yang paling banyak berubah setelah uji coba</h2>
<p>Kami menguji dengan dua belas orang, setengahnya belum pernah memakai headset. Tiga temuan mengubah desain secara mendasar: relief perlu diterangi lebih kuat dari yang realistis karena mata tidak punya waktu beradaptasi; teks penjelasan harus muncul menempel di dekat objek, bukan di panel melayang; dan hampir semua orang ingin menyentuh, meski tahu tidak bisa.</p>
<p>Temuan ketiga itu yang paling mahal untuk ditangani, dan yang paling berdampak. Kami menambahkan pendar halus saat tangan mendekati relief. Tidak ada fungsi apa pun di baliknya, tapi rasa hadirnya melompat jauh.</p>
<h2>Yang akan saya lakukan berbeda</h2>
<p>Menetapkan satuan dan skala di hari pertama, sebelum satu tekstur pun dibuat. Menguji di headset setiap hari, bukan setiap milestone. Dan menganggarkan waktu untuk audio sejak awal, bukan menempelkannya di akhir sebagai pemanis.</p>
<p>Kalau ada satu kalimat yang ingin saya titipkan ke siapa pun yang baru mulai: karya spatial tidak dinilai dari seberapa mirip, tapi dari seberapa yakin tubuhmu berada di sana.</p>',
   9, 'published', '2026-06-08 05:00:00+00'),
  ('spatial-anchor-catatan', '006', 'teknis', 'Spatial Anchor: Catatan Awal',
   'Kenapa objek yang kamu letakkan di meja pelan-pelan bergeser, dan apa yang sebenarnya disimpan oleh sebuah anchor.',
   'Tim Spatial Indonesia', 'internal',
   '<h2>Anchor bukan koordinat</h2>
<p>Godaan pertama semua orang adalah menyimpan posisi objek sebagai tiga angka relatif terhadap titik awal sesi. Ini bekerja selama beberapa menit, lalu berhenti bekerja.</p>
<p>Anchor adalah janji yang berbeda: kamu meminta sistem pelacakan untuk mengingat sebuah titik relatif terhadap ciri-ciri dunia nyata yang dia kenali. Saat pemahaman sistem tentang ruangan diperbarui, koordinat numeriknya boleh berubah — yang dijaga adalah hubungannya dengan dunia.</p>
<h2>Kenapa objek bergeser</h2>
<p>Pelacakan inside-out membangun peta ruangan sambil berjalan, dan peta itu terus dikoreksi. Ketika sistem menyadari bahwa dua bagian ruangan yang dia kira terpisah sebenarnya sama, seluruh peta digeser sedikit. Objek yang dipasang ke koordinat mentah akan ikut meleset; objek yang dipasang ke anchor ikut terkoreksi.</p>
<p>Penyebab kedua yang lebih membosankan: permukaan tanpa tekstur. Meja putih polos dan dinding kosong memberi sedikit sekali ciri untuk dikenali. Pencahayaan yang berubah juga menurunkan kualitas pelacakan secara drastis.</p>
<h2>Praktik yang menolong</h2>
<p>Buat anchor per objek atau per kelompok kecil objek yang berdekatan, bukan satu anchor untuk seluruh adegan. Perbarui transform objek dari anchor setiap frame alih-alih menyalinnya sekali saat pembuatan.</p>
<p>Dan yang paling sering dilupakan: beri pengguna cara untuk memperbaiki sendiri. Sebuah tombol kecil untuk memindahkan ulang objek menghemat lebih banyak keluhan daripada peningkatan akurasi pelacakan mana pun.</p>',
   4, 'published', '2026-04-14 05:00:00+00');

-- ── sparing (sudah disetujui, supaya cincin artikel tidak kosong) ───────
INSERT INTO sparings (article_id, frequency_id, author_name, body, anchor_x, anchor_y, boost, status, created_at)
SELECT a.id, v.freq, v.nama, v.isi, v.ax, v.ay, v.boost, 'approved', v.at
FROM (VALUES
  ('frame-budget-vr', 'observasi', 'Rian', 'Kami kena persis di poin overdraw. Ada empat panel kaca semi transparan yang saling menumpuk di lobi, frame time langsung naik 4 ms padahal segitiganya sedikit. Diganti jadi satu panel dengan tekstur palsu, beres.', 2::smallint, 1::smallint, 6, '2026-07-29 05:00:00+00'::timestamptz),
  ('frame-budget-vr', 'sinyal', 'Dewi', 'Tambahan: di Quest, fixed foveated rendering level 2 hampir tidak terlihat kalau adeganmu tidak punya teks kecil di tepi pandangan. Kalau ada, turunkan ke level 1 karena huruf di pinggir jadi berbayang.', 4::smallint, 0::smallint, 4, '2026-07-30 05:00:00+00'::timestamptz),
  ('frame-budget-vr', 'anomali', 'Bagas', 'Saya kurang setuju kalau visual selalu boleh dikorbankan. Untuk karya seni atau arsip budaya, menurunkan kualitas sampai obyeknya kehilangan makna itu juga kegagalan. Kadang jawabannya adalah mengurangi luas adegan, bukan menurunkan kualitasnya.', 1::smallint, 1::smallint, 3, '2026-08-02 05:00:00+00'::timestamptz),
  ('frame-budget-vr', 'sonde', 'Nadia', 'Untuk WebXR, ada cara yang cukup andal untuk membaca stale frame dari dalam browser, atau tetap harus lewat tool bawaan headset?', 3::smallint, 1::smallint, 1, '2026-08-05 05:00:00+00'::timestamptz),
  ('antarmuka-tanpa-sentuh', 'sinyal', 'Yoga', 'Soal jarak panel, 1,2 sampai 1,5 meter jadi titik manis di hampir semua tes yang kami lakukan. Di bawah 0,8 meter orang mulai mengeluh mata lelah setelah sepuluh menit, bahkan kalau teksnya besar.', 2::smallint, 1::smallint, 5, '2026-07-21 05:00:00+00'::timestamptz),
  ('antarmuka-tanpa-sentuh', 'observasi', 'Sekar', 'Kami menambahkan getaran 15 ms saat pointer masuk area tombol, bukan hanya saat menekan. Tingkat salah tekan turun jauh, dan tidak ada yang menyadari kenapa. Umpan balik sebelum aksi ternyata sama pentingnya.', 3::smallint, 1::smallint, 2, '2026-07-24 05:00:00+00'::timestamptz),
  ('antarmuka-tanpa-sentuh', 'sonde', 'Fajar', 'Bagaimana aturan ukuran target ini berubah kalau inputnya pelacakan tangan tanpa controller? Perasaan saya butuh lebih besar lagi.', 1::smallint, 1::smallint, 0, '2026-08-08 05:00:00+00'::timestamptz),
  ('webxr-jalan-tercepat', 'anomali', 'Hendra', 'Argumen distribusinya kuat, tapi jangan meremehkan biaya performa. Untuk proyek klien dengan adegan besar, saya tetap memilih native dan memberi tautan web sebagai versi ringkas. Dua-duanya, bukan salah satu.', 0::smallint, 1::smallint, 4, '2026-07-08 05:00:00+00'::timestamptz),
  ('webxr-jalan-tercepat', 'observasi', 'Maya', 'Pengalaman di lapangan: dari 40 guru yang kami undang, 38 berhasil membuka tautan AR di ponsel mereka sendiri tanpa bantuan. Angka itu tidak akan pernah kami capai dengan aplikasi yang harus dipasang.', 3::smallint, 1::smallint, 3, '2026-07-12 05:00:00+00'::timestamptz),
  ('occlusion-ar-palsu', 'sinyal', 'Arif', 'Poin bayangan kontak sering diremehkan. Kami memakai satu tekstur lingkaran blur yang diskalakan menurut tinggi objek, ongkosnya satu draw call, dan hasilnya lebih meyakinkan daripada bayangan real-time yang kami pakai sebelumnya.', 3::smallint, 1::smallint, 3, '2026-06-25 05:00:00+00'::timestamptz),
  ('occlusion-ar-palsu', 'sonde', 'Tika', 'Untuk transisi lembut di ambang kedalaman, kira-kira berapa lebar yang masih terasa wajar? Kami mencoba beberapa nilai dan hasilnya selalu terlalu kabur atau tetap berkedip.', 2::smallint, 1::smallint, 1, '2026-07-02 05:00:00+00'::timestamptz),
  ('skala-borobudur-vr', 'observasi', 'Putri', 'Silinder 1,7 meter itu trik yang sama yang kami pakai, dan saya heran kenapa tidak pernah masuk tutorial mana pun. Kami menyimpannya sebagai prefab dan menariknya ke setiap adegan baru sebelum apa pun yang lain.', 0::smallint, 1::smallint, 7, '2026-06-11 05:00:00+00'::timestamptz),
  ('skala-borobudur-vr', 'sinyal', 'Galih', 'Soal rasa naik yang dibawa audio: menambahkan gema yang berubah tiap teras membantu banyak. Ruang terbuka di atas terdengar berbeda dari lorong di bawah, dan tubuh langsung membacanya sebagai ketinggian.', 2::smallint, 1::smallint, 2, '2026-06-19 05:00:00+00'::timestamptz),
  ('spatial-anchor-catatan', 'sinyal', 'Bimo', 'Tambahan kecil: kalau ruangannya punya dinding polos, tempelkan poster atau taruh benda bertekstur di beberapa titik sebelum sesi. Kedengaran bodoh, tapi kualitas pelacakan naik jelas.', 1::smallint, 1::smallint, 2, '2026-04-18 05:00:00+00'::timestamptz)
) AS v(slug, freq, nama, isi, ax, ay, boost, at)
JOIN articles a ON a.slug = v.slug;

-- ── agenda ──────────────────────────────────────────────────────────────
-- Jarak sudut planet Event ke Titik Temu dihitung dari acara terdekat di
-- tabel ini, jadi menambah atau menghapus baris di sini benar-benar memindahkan
-- planetnya di layar.
INSERT INTO agenda_events (id, kind, title, event_date, place, note) VALUES
  ('meetup-11', 'MEETUP', 'XR Meetup #11', '2026-08-01', 'Jakarta', 'Demo malam & tukar perangkat.'),
  ('meetup-12', 'MEETUP', 'XR Meetup #12 — Malam Demo', '2026-08-30', 'Jakarta', 'Demo karya member, coba perangkat bareng.'),
  ('workshop-webxr', 'WORKSHOP', 'Workshop WebXR untuk Pemula', '2026-09-12', 'Daring', 'Kelas praktik tiga jam, kuota 40 orang.'),
  ('open-build', 'KOLABORASI', 'Open Build — Showcase Day', '2026-10-03', 'Bandung', 'Pameran proyek lintas disiplin.'),
  ('kampus-ugm', 'KAMPUS', 'Kelas Keliling — UGM', '2026-10-24', 'Yogyakarta', 'Pengenalan teknologi spatial untuk mahasiswa.'),
  ('meetup-13', 'MEETUP', 'XR Meetup #13', '2026-11-14', 'Surabaya', 'Meetup pertama di Jawa Timur.');

-- ── jejak kehadiran contoh ──────────────────────────────────────────────
-- Diberi stempel waktu relatif terhadap saat seed dijalankan supaya jejaknya
-- selalu tampak "baru saja" — kalau ditulis absolut, minggu depan lintasannya
-- semua tampil redup dan fitur ini jadi terlihat rusak.
INSERT INTO presence_visits (path, created_at) VALUES
  (ARRAY['inti', 'program', 'karya']::text[], now() - interval '3 minutes'),
  (ARRAY['insight', 'tim', 'gabung']::text[], now() - interval '9 minutes'),
  (ARRAY['inti', 'event', 'program']::text[], now() - interval '17 minutes'),
  (ARRAY['karya', 'insight']::text[], now() - interval '26 minutes'),
  (ARRAY['gabung', 'inti', 'tim']::text[], now() - interval '48 minutes'),
  (ARRAY['program', 'event', 'insight']::text[], now() - interval '71 minutes'),
  (ARRAY['tim', 'karya', 'inti']::text[], now() - interval '96 minutes'),
  (ARRAY['event', 'gabung']::text[], now() - interval '133 minutes');

-- ── pengaturan situs ────────────────────────────────────────────────────
INSERT INTO site_settings (key, value) VALUES
  ('insight.fresh_days', '30'::jsonb),
  ('insight.sparing_moderation', 'true'::jsonb),
  ('presence.limit', '12'::jsonb),
  ('site.name', '"Spatial Indonesia"'::jsonb),
  ('site.tagline', '"Opening Access of Emerging Spatial Technology"'::jsonb);

COMMIT;
