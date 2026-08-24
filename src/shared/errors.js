// Galat domain: dilempar dari lapisan mana pun, diterjemahkan jadi HTTP hanya
// di satu tempat (interfaces/http/middleware/error.js).
//
// Ini yang membuat `application/` dan `domain/` tidak perlu tahu HTTP sama
// sekali — service melempar `new NotFoundError('Artikel')`, bukan
// `res.status(404)`. Sisi web bisa diganti (CLI, worker, GraphQL) tanpa
// menyentuh aturan bisnisnya.
export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details = null, cause } = {}) {
    super(message, { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.details = details;
    // Galat yang kita lempar sendiri aman ditampilkan ke klien; galat tak
    // terduga tidak. Bendera ini yang dipakai middleware untuk memutuskan.
    this.expected = status < 500;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(details, message = 'Data yang dikirim tidak valid.') {
    super(message, { status: 422, code: 'VALIDATION_ERROR', details });
  }
}

export class NotFoundError extends AppError {
  constructor(subjek = 'Data') {
    super(`${subjek} tidak ditemukan.`, { status: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Data sudah ada.', details = null) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Kredensial tidak valid atau sesi habis.') {
    super(message, { status: 401, code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Akun ini tidak berhak melakukan aksi tersebut.') {
    super(message, { status: 403, code: 'FORBIDDEN' });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Terlalu banyak permintaan. Coba lagi sebentar lagi.') {
    super(message, { status: 429, code: 'RATE_LIMITED' });
  }
}
