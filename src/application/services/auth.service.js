import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';

// Autentikasi admin.
//
// Bentuknya access token pendek + refresh token panjang yang bisa dicabut,
// keduanya dikirim sebagai cookie httpOnly. Alasan memilih cookie dan bukan
// menyimpan token di localStorage: apa pun yang bisa dibaca JavaScript bisa
// dibaca skrip yang berhasil disuntikkan. Cookie httpOnly tidak. Konsekuensinya
// muncul CSRF, dan itu ditutup terpisah di middleware/csrf.js — sebuah
// pertukaran yang jelas dan bisa ditangani, bukan lubang yang menganga.
const HARI = 86_400_000;

export class AuthService {
  constructor({ users, sessions, audit, hasher, tokens, monitor, refreshTtlDays = 14 }) {
    this.users = users;
    this.sessions = sessions;
    this.audit = audit;
    this.hasher = hasher;
    this.tokens = tokens;
    this.monitor = monitor;
    this.refreshTtlDays = refreshTtlDays;
  }

  async login({ email, password, userAgent, ip, ipHash, requestId }) {
    const user = await this.users.findByEmail(String(email).trim().toLowerCase());

    // Kalau akunnya tidak ada, kata sandi tetap diaduk terhadap hash palsu.
    // Tanpa ini, login untuk email yang tidak terdaftar selesai jauh lebih
    // cepat daripada yang terdaftar, dan selisih waktu itu cukup untuk memetakan
    // siapa saja yang punya akun.
    const hash = user?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const cocok = await this.hasher.verify(password, hash);

    if (!user || !cocok) {
      // Dicatat dengan email yang dicoba, bukan email yang ada. Pola serangan
      // yang paling berguna dilihat justru "email apa saja yang ditebak" —
      // termasuk yang tidak pernah terdaftar.
      this.monitor?.catat({
        kind: 'login_failed',
        message: `Failed sign-in attempt for ${email}`,
        actorEmail: String(email).slice(0, 160),
        ipHash: ipHash, userAgent, requestId,
        meta: { reason: user ? 'wrong password' : 'unknown account' }
      });
      throw new UnauthorizedError('Email atau kata sandi salah.');
    }
    if (!user.is_active) {
      this.monitor?.catat({
        kind: 'forbidden',
        message: `Sign-in attempt on a disabled account: ${user.email}`,
        actorEmail: user.email, ipHash, userAgent, requestId
      });
      throw new ForbiddenError('Akun ini dinonaktifkan.');
    }

    const sesi = await this._openSession(user, { userAgent, ip });
    await this.users.touchLogin(user.id);
    await this.audit.record({
      actorId: user.id, actorEmail: user.email, action: 'login', entity: 'session', ip, requestId
    });
    this.monitor?.catat({
      kind: 'login_ok',
      message: `${user.email} signed in`,
      actorEmail: user.email, ipHash, userAgent, requestId
    });

    return sesi;
  }

  async _openSession(user, { userAgent, ip, familyId = null }) {
    const refresh = this.tokens.newRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * HARI);

    const sesi = await this.sessions.create({
      userId: user.id,
      refreshTokenHash: this.tokens.hashRefreshToken(refresh),
      userAgent: userAgent?.slice(0, 300) ?? null,
      ip: ip ?? null,
      expiresAt,
      familyId
    });

    const access = this.tokens.signAccess({
      sub: user.id, email: user.email, role: user.role, sid: sesi.id
    });

    return {
      accessToken: access,
      refreshToken: refresh,
      refreshExpiresAt: expiresAt,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
  }

  // Rotasi: setiap kali di-refresh, sesi lama dicabut dan yang baru dibuat.
  // Kalau sebuah refresh token dicuri, ia hanya berguna sampai pemilik aslinya
  // melakukan refresh berikutnya — setelah itu token curian jadi tidak valid.
  async refresh({ refreshToken, userAgent, ip, ipHash, requestId }) {
    if (!refreshToken) throw new UnauthorizedError('Tidak ada sesi.');
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const sesi = await this.sessions.findByTokenHash(hash);
    if (!sesi) throw new UnauthorizedError('Sesi tidak valid atau sudah habis.');

    // ── deteksi pencurian sesi ────────────────────────────────────────────
    //
    // Token ini sah, pernah ada, dan SUDAH dipakai untuk rotasi. Pemilik
    // aslinya berarti sudah lanjut ke token berikutnya — jadi siapa pun yang
    // memakai token lama ini memegang salinan yang bukan miliknya.
    //
    // Yang dicabut bukan cuma token itu, tapi seluruh keluarga sesinya:
    // pencurinya mungkin sudah sempat merotasi beberapa kali, dan mencabut
    // satu per satu berarti membiarkan rantai yang lebih baru tetap hidup.
    // Pemilik aslinya ikut terlempar keluar, dan itu memang yang diinginkan —
    // ia harus masuk ulang, dan idealnya mengganti kata sandinya.
    if (sesi.dipakaiUlang) {
      const dicabut = await this.sessions.revokeFamily(sesi.family_id);
      this.monitor?.catat({
        kind: 'session_revoked',
        severity: 'critical',
        message: `Rotated refresh token replayed for ${sesi.email} — the whole session family was revoked`,
        actorEmail: sesi.email, ipHash, userAgent, requestId,
        meta: { familyId: sesi.family_id, sessionsRevoked: dicabut }
      });
      throw new UnauthorizedError('Sesi ditutup karena terdeteksi dipakai dari dua tempat. Masuk lagi, dan pertimbangkan mengganti kata sandi.');
    }

    if (!sesi.aktif) throw new UnauthorizedError('Sesi tidak valid atau sudah habis.');
    if (!sesi.is_active) throw new ForbiddenError('Akun ini dinonaktifkan.');

    await this.sessions.markRotated(sesi.id);
    return this._openSession(
      { id: sesi.user_id, email: sesi.email, name: sesi.name, role: sesi.role },
      { userAgent, ip, familyId: sesi.family_id }
    );
  }

  async logout({ refreshToken, actor, ip }) {
    if (refreshToken) {
      const sesi = await this.sessions.findByTokenHash(this.tokens.hashRefreshToken(refreshToken));
      if (sesi?.aktif) await this.sessions.revoke(sesi.id);
    }
    if (actor) {
      await this.audit.record({
        actorId: actor.id, actorEmail: actor.email, action: 'logout', entity: 'session', ip
      });
    }
  }

  async me(userId) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError('Akun tidak ditemukan.');
    if (!user.is_active) throw new ForbiddenError('Akun ini dinonaktifkan.');
    return user;
  }

  async changePassword({ userId, currentPassword, newPassword }) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('Akun admin');
    const lengkap = await this.users.findByEmail(user.email);
    if (!(await this.hasher.verify(currentPassword, lengkap.password_hash))) {
      throw new UnauthorizedError('Kata sandi saat ini salah.');
    }
    if (currentPassword === newPassword) {
      throw new ValidationError({ newPassword: 'Kata sandi baru harus berbeda.' });
    }
    await this.users.update(userId, { passwordHash: await this.hasher.hash(newPassword) });
    this.monitor?.catat({
      kind: 'password_changed',
      message: `${user.email} changed their password`,
      actorEmail: user.email
    });
    // Ganti kata sandi membatalkan semua sesi lain. Itulah yang diharapkan
    // orang saat mereka mengganti kata sandi karena curiga akunnya dipakai.
    await this.sessions.revokeAllForUser(userId);
    await this.audit.record({
      actorId: userId, actorEmail: user.email, action: 'change_password', entity: 'admin_user', entityId: userId
    });
  }
}
