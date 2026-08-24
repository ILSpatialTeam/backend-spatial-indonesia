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

export const toAgendaEvent = (row) => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  date: String(row.event_date).slice(0, 10),
  place: row.place,
  note: row.note,
  url: row.url ?? null,
  ...(row.is_published === undefined ? {} : { isPublished: row.is_published })
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
