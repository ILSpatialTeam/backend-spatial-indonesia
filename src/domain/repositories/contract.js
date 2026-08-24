// Kontrak repositori.
//
// JavaScript tidak punya interface, jadi peran itu diambil kelas abstrak yang
// setiap methodnya melempar. Gunanya bukan pemeriksaan tipe — itu memang tidak
// ada — melainkan tiga hal yang nyata:
//
//   1. Lapisan `application/` bisa menyebut nama method yang ia butuhkan tanpa
//      pernah mengimpor `pg`. Arah ketergantungannya jadi terbalik: yang
//      konkret (Postgres) yang menyesuaikan diri ke yang abstrak, bukan
//      sebaliknya (D pada SOLID).
//   2. Implementasi yang lupa satu method gagal saat dipanggil dengan pesan
//      yang menyebut nama methodnya, bukan "x is not a function".
//   3. Daftar method di sini adalah dokumentasi paling jujur soal apa yang
//      sebenarnya dibutuhkan sebuah service — dan begitu daftarnya kepanjangan,
//      itu tanda service-nya mengambil terlalu banyak urusan.
//
// Antarmukanya dipecah per agregat, bukan satu `Repository` raksasa: service
// artikel tidak seharusnya kenal method sesi admin (I pada SOLID).
const belum = (kelas, method) => {
  throw new Error(`${kelas}.${method}() belum diimplementasikan.`);
};

class Contract {
  constructor() {
    if (new.target === Contract) throw new Error('Contract abstrak, jangan diinstansiasi.');
  }
  _abstract(method) {
    belum(this.constructor.name, method);
  }
}

export class MenuRepository extends Contract {
  listAll() { this._abstract('listAll'); }
  listActive() { this._abstract('listActive'); }
  findById(_id) { this._abstract('findById'); }
  create(_data) { this._abstract('create'); }
  update(_id, _patch) { this._abstract('update'); }
  remove(_id) { this._abstract('remove'); }
  replaceItems(_id, _items) { this._abstract('replaceItems'); }
  replaceLinks(_id, _links) { this._abstract('replaceLinks'); }
  reorder(_urutan) { this._abstract('reorder'); }
}

export class ArticleRepository extends Contract {
  listPublished(_opsi) { this._abstract('listPublished'); }
  listForAdmin(_opsi) { this._abstract('listForAdmin'); }
  findBySlug(_slug, _opsi) { this._abstract('findBySlug'); }
  findById(_id) { this._abstract('findById'); }
  takenSlugs() { this._abstract('takenSlugs'); }
  create(_data) { this._abstract('create'); }
  update(_id, _patch) { this._abstract('update'); }
  remove(_id) { this._abstract('remove'); }
  incrementView(_id) { this._abstract('incrementView'); }
  nextNo() { this._abstract('nextNo'); }
}

export class TaxonomyRepository extends Contract {
  listCategories() { this._abstract('listCategories'); }
  upsertCategory(_data) { this._abstract('upsertCategory'); }
  removeCategory(_id) { this._abstract('removeCategory'); }
  listFrequencies() { this._abstract('listFrequencies'); }
  upsertFrequency(_data) { this._abstract('upsertFrequency'); }
}

export class SparingRepository extends Contract {
  listApprovedByArticle(_articleId) { this._abstract('listApprovedByArticle'); }
  listApprovedGrouped() { this._abstract('listApprovedGrouped'); }
  listForModeration(_opsi) { this._abstract('listForModeration'); }
  create(_data) { this._abstract('create'); }
  setStatus(_id, _status) { this._abstract('setStatus'); }
  boost(_id) { this._abstract('boost'); }
  remove(_id) { this._abstract('remove'); }
  countRecentFrom(_ipHash, _sejak) { this._abstract('countRecentFrom'); }
}

export class AgendaRepository extends Contract {
  listPublished() { this._abstract('listPublished'); }
  listAll() { this._abstract('listAll'); }
  findById(_id) { this._abstract('findById'); }
  create(_data) { this._abstract('create'); }
  update(_id, _patch) { this._abstract('update'); }
  remove(_id) { this._abstract('remove'); }
}

export class PresenceRepository extends Contract {
  listRecent(_limit) { this._abstract('listRecent'); }
  record(_path, _ipHash) { this._abstract('record'); }
  prune(_sebelum) { this._abstract('prune'); }
}

export class SubmissionRepository extends Contract {
  list(_opsi) { this._abstract('list'); }
  create(_data) { this._abstract('create'); }
  setStatus(_id, _status, _handledBy) { this._abstract('setStatus'); }
  remove(_id) { this._abstract('remove'); }
}

export class AdminUserRepository extends Contract {
  findByEmail(_email) { this._abstract('findByEmail'); }
  findById(_id) { this._abstract('findById'); }
  list() { this._abstract('list'); }
  create(_data) { this._abstract('create'); }
  update(_id, _patch) { this._abstract('update'); }
  remove(_id) { this._abstract('remove'); }
  touchLogin(_id) { this._abstract('touchLogin'); }
  count() { this._abstract('count'); }
}

export class SessionRepository extends Contract {
  create(_data) { this._abstract('create'); }
  findByTokenHash(_hash) { this._abstract('findByTokenHash'); }
  markRotated(_id) { this._abstract('markRotated'); }
  revoke(_id) { this._abstract('revoke'); }
  revokeFamily(_familyId) { this._abstract('revokeFamily'); }
  revokeAllForUser(_userId) { this._abstract('revokeAllForUser'); }
  pruneExpired() { this._abstract('pruneExpired'); }
}

export class SettingsRepository extends Contract {
  all() { this._abstract('all'); }
  get(_key) { this._abstract('get'); }
  set(_key, _value) { this._abstract('set'); }
}

export class AuditRepository extends Contract {
  record(_entry) { this._abstract('record'); }
  list(_opsi) { this._abstract('list'); }
}

export class SkyRepository extends Contract {
  listApproved() { this._abstract('listApproved'); }
  listAll(_opsi) { this._abstract('listAll'); }
  findByIpHash(_ipHash) { this._abstract('findByIpHash'); }
  create(_data) { this._abstract('create'); }
  setStatus(_id, _status) { this._abstract('setStatus'); }
  remove(_id) { this._abstract('remove'); }
  count() { this._abstract('count'); }
}

export class SecurityEventRepository extends Contract {
  record(_event) { this._abstract('record'); }
  list(_opsi) { this._abstract('list'); }
  ringkasan(_sejak) { this._abstract('ringkasan'); }
  deret(_hari) { this._abstract('deret'); }
  sumberTeratas(_sejak, _limit) { this._abstract('sumberTeratas'); }
  prune(_sebelum) { this._abstract('prune'); }
}

// Kesehatan database. Dipisah dari repositori lain karena ia tidak membaca
// data aplikasi sama sekali — isinya kueri ke katalog sistem Postgres, dan
// mencampurnya ke repositori domain akan mengaburkan batas itu.
export class HealthRepository extends Contract {
  database() { this._abstract('database'); }
  tabel() { this._abstract('tabel'); }
  koneksi() { this._abstract('koneksi'); }
  kueriLambat() { this._abstract('kueriLambat'); }
  indeksTerpakai() { this._abstract('indeksTerpakai'); }
}

export class MediaRepository extends Contract {
  list(_opsi) { this._abstract('list'); }
  create(_data) { this._abstract('create'); }
  findById(_id) { this._abstract('findById'); }
  remove(_id) { this._abstract('remove'); }
}
