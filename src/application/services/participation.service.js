import { ConflictError, NotFoundError, RateLimitError, ValidationError } from '../../shared/errors.js';
import { stripTags } from '../../shared/html.js';
import { registrationState, REG_ALASAN } from '../../domain/entities/agenda.js';
import { TAG } from '../../infrastructure/cache/memory-cache.js';

// Segala yang dikirim pengunjung: sparing, jejak kunjungan, pendaftaran Gabung.
//
// Semua yang masuk lewat sini datang dari internet terbuka, jadi aturannya
// beda dengan jalur admin: teksnya dibersihkan dari tag, jumlahnya dibatasi,
// dan tidak ada satu pun yang langsung tampil tanpa persetujuan kalau moderasi
// menyala.
const SEJAM = 3_600_000;
const MAKS_SPARING_PER_JAM = 5;

export class ParticipationService {
  constructor({ articles, sparings, presence, submissions, agenda, settings, cache }) {
    this.articles = articles;
    this.agenda = agenda;
    this.sparings = sparings;
    this.presence = presence;
    this.submissions = submissions;
    this.settings = settings;
    this.cache = cache;
  }

  async _moderasiMenyala() {
    const nilai = await this.cache.wrap('setting:moderation', { tags: [TAG.settings] }, () =>
      this.settings.get('insight.sparing_moderation')
    );
    return nilai !== false;
  }

  async submitSparing({ slug, frequencyId, authorName, text, anchor, ipHash }) {
    const artikel = await this.articles.findBySlug(slug, { publishedOnly: true });
    if (!artikel) throw new NotFoundError('Artikel');

    // Batas per sumber, dihitung dari database dan bukan dari penghitung di
    // memori — restart proses tidak boleh jadi cara mengosongkan jatah.
    const terkini = await this.sparings.countRecentFrom(ipHash, new Date(Date.now() - SEJAM));
    if (terkini >= MAKS_SPARING_PER_JAM) {
      throw new RateLimitError('Sudah cukup banyak sparing dari sini dalam satu jam terakhir. Istirahat dulu.');
    }

    // Tag dibuang, bukan di-escape. Sparing tidak pernah butuh HTML, dan
    // menyimpan yang polos berarti tidak ada jalur render yang bisa salah.
    const nama = stripTags(authorName);
    const isi = stripTags(text);

    // Divalidasi ULANG setelah sanitasi.
    //
    // Zod memeriksa panjang kiriman mentah, dan `<img src=x onerror=…>`
    // panjangnya 26 karakter — lolos. Setelah tagnya dibuang ia jadi string
    // kosong, dan yang menolaknya jadi CHECK constraint di database, dengan
    // pesan "Nilai melanggar aturan data" yang tidak memberi tahu pengirim apa
    // pun. Pemeriksaan kedua di sini mengembalikan pesan yang bisa ditindak.
    const galat = {};
    if (nama.length < 2) galat.authorName = 'Nama tidak boleh kosong setelah tag HTML dibuang.';
    if (isi.length < 8) galat.text = 'Isi sparing terlalu pendek setelah tag HTML dibuang.';
    if (Object.keys(galat).length) throw new ValidationError(galat);

    const moderasi = await this._moderasiMenyala();
    const dibuat = await this.sparings.create({
      articleId: artikel.id,
      frequencyId,
      authorName: nama,
      body: isi,
      anchorX: anchor?.[0] ?? 0,
      anchorY: anchor?.[1] ?? 1,
      status: moderasi ? 'pending' : 'approved',
      ipHash
    });

    if (!moderasi) this.cache.invalidate(TAG.sparing);

    return {
      sparing: {
        id: dibuat.id,
        freq: dibuat.freq,
        name: dibuat.name,
        text: dibuat.text,
        anchor: [dibuat.anchor_x, dibuat.anchor_y],
        boost: dibuat.boost,
        at: new Date(dibuat.created_at).toISOString().slice(0, 10)
      },
      // Frontend perlu tahu apakah satelitnya langsung muncul di cincin atau
      // baru setelah disetujui — supaya pesannya jujur, bukan "terkirim!"
      // padahal tidak ada yang berubah di layar.
      moderated: moderasi
    };
  }

  async boostSparing(id) {
    const hasil = await this.sparings.boost(id);
    this.cache.invalidate(TAG.sparing);
    return hasil;
  }

  // Jejak kunjungan. Divalidasi terhadap daftar menu yang ada supaya tabelnya
  // tidak bisa diisi id sembarangan lewat curl.
  async recordPresence({ path, ipHash, menuIds }) {
    const bersih = [...new Set(path)].filter((id) => menuIds.has(id));
    if (!bersih.length) throw new ValidationError({ path: 'tidak ada planet yang dikenali' });
    const baris = await this.presence.record(bersih.slice(0, 12), ipHash);
    return { id: baris.id, path: bersih };
  }

  async submitJoin({ name, email, focus, message, ipHash, userAgent }) {
    const nama = stripTags(name);
    if (nama.length < 2) {
      throw new ValidationError({ name: 'Nama tidak boleh kosong setelah tag HTML dibuang.' });
    }
    try {
      await this.submissions.create({
        name: nama,
        email: String(email).trim().toLowerCase(),
        focus: stripTags(focus ?? ''),
        message: stripTags(message ?? ''),
        ipHash,
        userAgent: userAgent?.slice(0, 300) ?? null
      });
    } catch (err) {
      // Email yang sudah punya pendaftaran terbuka ditelan diam-diam.
      //
      // Versi sebelumnya menjawab "Email ini sudah terdaftar" — ramah, dan
      // justru itu masalahnya: siapa pun bisa menguji apakah seseorang anggota
      // komunitas hanya dengan mengirim alamatnya. Sekarang jawabannya identik
      // untuk email baru dan email yang sudah ada, dan duplikatnya cukup tidak
      // membuat baris kedua.
      if (!(err instanceof ConflictError)) throw err;
    }

    // Tidak ada id yang dikembalikan. Pengirim tidak membutuhkannya, dan
    // memberikannya berarti membedakan dua jalur yang barusan disamakan.
    return { ok: true, message: 'Terima kasih! Kami hubungi lewat email.' };
  }

  // ── pendaftaran acara ─────────────────────────────────────────────────────
  //
  // Berbeda dengan Gabung di atas, di sini duplikat TIDAK ditelan diam-diam.
  //
  // Alasannya kebalikan dari yang di sana. Untuk Gabung, jawaban "sudah
  // terdaftar" membocorkan keanggotaan seseorang kepada siapa pun yang menebak
  // alamatnya. Untuk acara, orang yang mendaftar perlu tahu apakah kursinya
  // benar-benar ada — dan menjawab "berhasil" pada pendaftaran yang tidak
  // membuat baris apa pun akan membuat orang datang ke acara berkuota tanpa
  // tempat. Kebocoran yang tersisa ("email X ikut acara Y") ditukar sadar
  // dengan kepastian itu; acaranya publik, daftar hadirnya tidak rahasia.
  async registerForEvent({ eventId, name, email, phone, note, ipHash, userAgent }) {
    const acara = await this.agenda.findPublishedById(eventId);
    if (!acara) throw new NotFoundError('Agenda');

    const keadaan = registrationState(acara);

    // Diperiksa di sini walau tombolnya di frontend sudah mati. Yang mengirim
    // POST tidak selalu tombol itu, dan keadaannya bisa berubah antara halaman
    // dibuka dan formulir dikirim.
    if (keadaan.mode === 'external') {
      throw new ValidationError(
        { registration: 'Pendaftaran acara ini dikelola di luar situs.' },
        'Acara ini memakai pendaftaran pihak ketiga.'
      );
    }
    if (keadaan.mode === 'none') {
      throw new ValidationError(
        { registration: 'Acara ini terbuka, tidak perlu mendaftar.' },
        'Acara ini tidak memakai pendaftaran.'
      );
    }
    if (!keadaan.open) {
      const pesan = {
        [REG_ALASAN.penuh]: 'Kuota acara ini sudah penuh.',
        [REG_ALASAN.ditutup]: 'Pendaftaran acara ini sudah ditutup.',
        [REG_ALASAN.lewat]: 'Acara ini sudah lewat.'
      }[keadaan.reason] ?? 'Pendaftaran acara ini sedang tidak dibuka.';
      throw new ConflictError(pesan, { reason: keadaan.reason });
    }

    // Sama seperti sparing: tag dibuang, lalu panjangnya diperiksa ULANG.
    // Zod sudah memeriksa kiriman mentah, tapi `<b></b>` lolos panjang minimum
    // dan jadi string kosong setelah dibersihkan.
    const nama = stripTags(name);
    const galat = {};
    if (nama.length < 2) galat.name = 'Nama tidak boleh kosong setelah tag HTML dibuang.';
    if (Object.keys(galat).length) throw new ValidationError(galat);

    const hasil = await this.agenda.register(eventId, {
      name: nama,
      email: String(email).trim().toLowerCase(),
      phone: stripTags(phone ?? '').slice(0, 32),
      note: stripTags(note ?? '').slice(0, 500),
      ipHash,
      userAgent: userAgent?.slice(0, 300) ?? null
    });

    // Sisa kursi di kartu Event ikut cache bootstrap. Tanpa pembatalan ini,
    // angkanya baru menyusul sampai dua menit kemudian — dan "sisa 3" yang
    // bertahan setelah tiga orang mendaftar adalah persis salah paham yang
    // membuat orang keempat mengisi formulir untuk ditolak.
    this.cache.invalidate(TAG.agenda);

    return {
      ok: true,
      registration: {
        id: hasil.registration.id,
        name: hasil.registration.name,
        email: hasil.registration.email,
        at: new Date(hasil.registration.created_at).toISOString()
      },
      seatsTaken: hasil.seatsTaken,
      seatsLeft: hasil.capacity === null ? null : Math.max(0, hasil.capacity - hasil.seatsTaken)
    };
  }
}
