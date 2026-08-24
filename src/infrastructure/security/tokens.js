import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { TokenService } from '../../application/ports.js';
import { randomToken } from './hashing.js';
import { UnauthorizedError } from '../../shared/errors.js';

// Dua token dengan tugas berbeda.
//
// Access token: JWT berumur pendek (15 menit), memuat identitas, tidak
// tersimpan di mana pun. Cukup diverifikasi tanda tangannya — tidak ada query
// database di jalur panas setiap permintaan.
//
// Refresh token: string acak berumur panjang, disimpan sebagai hash di
// admin_sessions. Bukan JWT, justru karena ia harus bisa dicabut — dan sesuatu
// yang bisa dicabut pasti perlu dicari di database, yang meniadakan satu-satunya
// keunggulan JWT.
export class JwtTokenService extends TokenService {
  constructor({ accessSecret, refreshSecret, accessTtl }) {
    super();
    this.accessSecret = accessSecret;
    this.refreshSecret = refreshSecret;
    this.accessTtl = accessTtl;
  }

  signAccess(payload) {
    return jwt.sign(payload, this.accessSecret, {
      expiresIn: this.accessTtl,
      issuer: 'spatial-indonesia',
      audience: 'admin-dashboard'
    });
  }

  verifyAccess(token) {
    try {
      return jwt.verify(token, this.accessSecret, {
        issuer: 'spatial-indonesia',
        audience: 'admin-dashboard',
        // Algoritma dikunci. Tanpa ini, token ber-`alg: none` atau yang
        // ditandatangani dengan algoritma lain bisa lolos — lubang klasik JWT.
        algorithms: ['HS256']
      });
    } catch (err) {
      throw new UnauthorizedError(
        err.name === 'TokenExpiredError' ? 'Sesi habis. Masuk lagi.' : 'Token tidak valid.'
      );
    }
  }

  newRefreshToken() {
    return randomToken(48);
  }

  // Refresh token di-hash dengan SHA-256 ber-garam, bukan bcrypt: nilainya
  // sudah 48 byte acak, jadi tidak ada yang bisa ditebak dari kamus dan hash
  // lambat cuma memperlambat setiap refresh tanpa menambah keamanan.
  hashRefreshToken(token) {
    return createHash('sha256').update(`${this.refreshSecret}:${token}`).digest('hex');
  }
}
