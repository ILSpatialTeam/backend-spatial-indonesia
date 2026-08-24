import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError } from '../../shared/errors.js';

// Berkas yang diunggah admin: sampul artikel dan gambar di dalam tulisan.
//
// Yang disimpan di database cuma metadata; berkasnya sendiri di folder uploads/.
// Nama simpannya dibangkitkan (bukan nama asli dari pengguna) — nama berkas
// kiriman adalah salah satu jalur path traversal yang paling sering terlupa,
// dan membuang namanya sama sekali menutup jalur itu tanpa perlu menyaring.
export class MediaService {
  constructor({ media, audit, uploadDir, publicUrl }) {
    this.media = media;
    this.audit = audit;
    this.uploadDir = uploadDir;
    this.publicUrl = publicUrl;
  }

  _url(storedName) {
    return `${this.publicUrl.replace(/\/+$/, '')}/uploads/${storedName}`;
  }

  async list(opsi) {
    const { rows, total } = await this.media.list(opsi);
    return { items: rows.map((r) => ({ ...r, url: this._url(r.stored_name) })), total };
  }

  async register(file, actor) {
    const row = await this.media.create({
      filename: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      byteSize: file.size,
      uploadedBy: actor?.id ?? null
    });
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'upload',
      entity: 'media', entityId: row.id, meta: { filename: row.filename, size: row.byte_size }
    });
    return { ...row, url: this._url(row.stored_name) };
  }

  async remove(id, actor) {
    const ada = await this.media.findById(id);
    if (!ada) throw new NotFoundError('Berkas media');
    const storedName = await this.media.remove(id);
    // Baris database sudah hilang; berkas yang gagal dihapus cuma menyisakan
    // sampah di disk, bukan data yang salah. Karena itu kegagalannya tidak
    // dilempar ke atas.
    await unlink(path.join(this.uploadDir, storedName)).catch(() => {});
    await this.audit.record({
      actorId: actor?.id, actorEmail: actor?.email, action: 'delete', entity: 'media', entityId: id
    });
  }
}
