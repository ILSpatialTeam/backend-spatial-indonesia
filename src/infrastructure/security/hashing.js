import bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PasswordHasher } from '../../application/ports.js';

// 12 putaran. Angka ini adalah pertukaran antara ongkos menebak dan waktu
// tunggu saat login: di perangkat masa kini sekitar 200–300 ms sekali hash,
// cukup lambat untuk membuat penebakan massal tidak ekonomis, cukup cepat untuk
// tidak terasa saat login. Naikkan seiring perangkat keras membaik.
const PUTARAN = 12;

export class BcryptPasswordHasher extends PasswordHasher {
  async hash(plain) {
    return bcrypt.hash(plain, PUTARAN);
  }

  async verify(plain, hash) {
    // bcrypt.compare sudah setara-waktu untuk hash yang valid. Untuk hash yang
    // formatnya rusak ia melempar; ditangkap di sini supaya kegagalan itu
    // terbaca sebagai "kata sandi salah", bukan galat 500 yang membocorkan
    // bahwa ada yang aneh dengan akun tersebut.
    try {
      return await bcrypt.compare(plain, hash);
    } catch {
      return false;
    }
  }
}

// IP pengunjung tidak pernah disimpan mentah untuk sparing dan pendaftaran.
// Yang dibutuhkan cuma "apakah dua kiriman ini dari sumber yang sama", dan hash
// ber-garam menjawab itu tanpa menyimpan data yang bisa mengidentifikasi orang.
//
// Garamnya diambil dari JWT secret supaya tidak ada rahasia baru yang harus
// diurus — dan supaya hash-nya tidak bisa dicocokkan lintas pemasangan.
export const hashIp = (ip, salt) =>
  ip ? createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32) : null;

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

// Perbandingan setara-waktu untuk nilai yang panjangnya sama-sama diketahui,
// dipakai token CSRF. `===` pada string membocorkan berapa karakter awal yang
// cocok lewat lama eksekusinya.
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length || !ba.length) return false;
  return timingSafeEqual(ba, bb);
}
