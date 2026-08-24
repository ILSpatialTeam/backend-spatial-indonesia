// Jejak kehadiran: lintasan penjelajah sebelumnya.
//
// Frontend hanya butuh "berapa menit lalu" untuk menentukan seberapa terang
// jejaknya. Menit, bukan stempel waktu, karena itu satu-satunya yang dipakai —
// dan karena membiarkan waktu kunjungan yang persis keluar dari server tanpa
// alasan adalah data yang diberikan cuma-cuma.
export const toTrail = (row, now = Date.now()) => ({
  ago: Math.max(0, Math.round((now - new Date(row.created_at).getTime()) / 60_000)),
  path: row.path
});
