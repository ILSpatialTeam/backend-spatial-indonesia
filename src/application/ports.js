// Port keluar milik lapisan aplikasi.
//
// Service butuh "sesuatu yang bisa mengaduk kata sandi" dan "sesuatu yang bisa
// menandatangani token" — bukan bcrypt dan bukan jsonwebtoken. Bedanya terasa
// saat bcrypt suatu hari diganti argon2: yang berubah satu berkas di
// infrastructure/, dan tidak ada satu pun service yang perlu dibuka.
const belum = (kelas, method) => {
  throw new Error(`${kelas}.${method}() belum diimplementasikan.`);
};

export class PasswordHasher {
  hash(_plain) { belum(this.constructor.name, 'hash'); }
  verify(_plain, _hash) { belum(this.constructor.name, 'verify'); }
}

export class TokenService {
  signAccess(_payload) { belum(this.constructor.name, 'signAccess'); }
  verifyAccess(_token) { belum(this.constructor.name, 'verifyAccess'); }
  newRefreshToken() { belum(this.constructor.name, 'newRefreshToken'); }
  hashRefreshToken(_token) { belum(this.constructor.name, 'hashRefreshToken'); }
}

export class Clock {
  now() { return Date.now(); }
}
