// Agenda: acara komunitas, sekaligus penggerak posisi planet Event.
//
// `agendaState()` di sini adalah salinan persis logika yang selama ini hidup di
// src/data/agenda.js pada frontend, dan itu memang disengaja — bukan
// duplikasi yang terlewat.
//
// Alasannya: frontend memanggil fungsi ini setiap frame untuk menentukan sudut
// planet Event terhadap Titik Temu. Memanggil API per frame jelas tidak masuk
// akal. Jadi pembagiannya begini — **daftar acaranya** datang dari server,
// **keadaannya** dihitung lokal dari daftar itu. Yang di sini dipakai untuk
// endpoint /agenda/state (dipakai panel headset dan pratinjau dashboard) supaya
// keduanya tidak pernah menjawab beda.
const HARI = 86_400_000;

// Pukul 12 WIB. Acara "tanggal 30" tidak boleh berpindah hari hanya karena
// pengunjungnya membuka situs dari zona waktu lain.
const stempel = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d, 5, 0, 0);
};

// `time` dari Postgres datang sebagai 'HH:MM:SS'. Yang dipakai di layar cuma
// jam dan menit, dan memotongnya di sini berarti tidak ada satu pun tampilan
// yang perlu tahu bentuk aslinya.
const jam = (v) => (v ? String(v).slice(0, 5) : null);

// ── keadaan pendaftaran ─────────────────────────────────────────────────────
//
// Satu fungsi, dipakai dua kali: untuk memberi tahu pengunjung apakah tombol
// daftarnya hidup, dan untuk menolak kiriman yang tetap datang walau tombolnya
// mati. Keduanya HARUS memakai aturan yang sama — kalau tidak, ada keadaan di
// mana tombolnya menyala tapi kirimannya selalu ditolak, dan pengunjung tidak
// punya cara menebak kenapa.
//
// Alasannya ikut dikembalikan, bukan cuma boolean: "kuota habis" dan
// "pendaftaran sudah ditutup" perlu kalimat yang berbeda di layar, dan
// menerjemahkan `false` jadi kalimat yang benar hanya bisa dilakukan di sini.
export const REG_ALASAN = Object.freeze({
  buka: 'open',
  tanpaPendaftaran: 'none',
  lewat: 'past',
  ditutup: 'closed',
  penuh: 'full'
});

export function registrationState(row, now = Date.now()) {
  const mode = row.registration ?? 'none';
  const kapasitas = row.capacity ?? null;
  // Baris yang tidak membawa hitungan kursi (mis. hasil update yang cuma
  // RETURNING kolom acara) dianggap nol, bukan NaN.
  const terpakai = Number(row.seats_taken ?? 0);
  const sisa = kapasitas === null ? null : Math.max(0, kapasitas - terpakai);

  const nilai = (alasan) => ({ mode, capacity: kapasitas, seatsTaken: terpakai, seatsLeft: sisa, open: alasan === REG_ALASAN.buka, reason: alasan });

  if (mode === 'none') return nilai(REG_ALASAN.tanpaPendaftaran);

  // Acara yang sudah lewat memakai stempel yang sama dengan sudut planetnya:
  // batasnya akhir hari-H, bukan detik ini. Acara sore hari tidak boleh
  // menutup pendaftarannya sendiri pada pukul satu siang.
  if (stempel(row.event_date) + HARI <= now) return nilai(REG_ALASAN.lewat);

  if (row.registration_closes_at && stempel(row.registration_closes_at) + HARI <= now) {
    return nilai(REG_ALASAN.ditutup);
  }

  // Kuota hanya kita yang menghitung untuk pendaftaran internal. Acara
  // 'external' boleh saja berkuota, tapi yang memegang angkanya Google Form —
  // memasang batas di sini akan menutup tombol yang sebetulnya masih menerima.
  if (mode === 'internal' && sisa !== null && sisa <= 0) return nilai(REG_ALASAN.penuh);

  return nilai(REG_ALASAN.buka);
}

export const toAgendaEvent = (row, now = Date.now()) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  date: String(row.event_date).slice(0, 10),
  startsAt: jam(row.starts_at),
  endsAt: jam(row.ends_at),
  place: row.place,
  note: row.note,
  url: row.url ?? null,
  // Kartu Event memakai ini untuk memutuskan apakah barisnya bisa dibuka.
  // Acara tanpa uraian panjang tetap bisa dibuka kalau ia menerima
  // pendaftaran — halamannya lalu berisi formulirnya saja, dan itu masih
  // lebih berguna daripada baris yang tampak bisa diklik tapi tidak membuka
  // apa-apa.
  hasDetail: !!String(row.description_html ?? '').trim() || (row.registration ?? 'none') !== 'none',
  registration: registrationState(row, now),
  ...(row.is_published === undefined ? {} : { isPublished: row.is_published })
});

// Bentuk halaman detail: semua yang di atas, ditambah yang hanya berguna kalau
// acaranya benar-benar dibuka.
export const toAgendaDetail = (row, now = Date.now()) => ({
  ...toAgendaEvent(row, now),
  address: row.address ?? '',
  descriptionHtml: row.description_html ?? '',
  registerUrl: row.register_url ?? null,
  registrationClosesAt: row.registration_closes_at
    ? String(row.registration_closes_at).slice(0, 10)
    : null
});

export function agendaState(events, now = Date.now()) {
  const berjadwal = events
    .map((a) => ({ ...a, at: stempel(a.date) }))
    .sort((a, b) => a.at - b.at);

  const next = berjadwal.find((a) => a.at >= now) || null;
  const lampau = berjadwal.filter((a) => a.at < now);
  const prev = lampau.length ? lampau[lampau.length - 1] : null;

  if (!next) return { next: null, prev, progress: 1, days: 0, list: berjadwal };

  // Kalau belum pernah ada acara sebelumnya, perjalanan dianggap dimulai 30
  // hari sebelum acara berikutnya — supaya busur di scene punya panjang yang
  // wajar dan tidak melompat penuh sejak hari pertama.
  const dari = prev ? prev.at : next.at - 30 * HARI;
  const rentang = Math.max(next.at - dari, HARI);

  return {
    next,
    prev,
    list: berjadwal,
    progress: Math.min(1, Math.max(0, (now - dari) / rentang)),
    days: Math.max(0, Math.ceil((next.at - now) / HARI))
  };
}
