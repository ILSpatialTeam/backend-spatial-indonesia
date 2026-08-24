import { hashIp } from '../../../infrastructure/security/hashing.js';
import { env } from '../../../config/env.js';

// Controller sengaja tipis: menerjemahkan HTTP jadi panggilan service dan
// sebaliknya, tidak lebih. Tidak ada satu pun aturan bisnis di berkas ini —
// itu yang membuat aturan yang sama berlaku sama persis lewat rute mana pun.
export function makePublicController({ content, participation, presenceHub, sky }) {
  const ipHash = (req) => hashIp(req.ip, env.ipHashSalt);

  return {
    async bootstrap(req, res) {
      res.sendCached(await content.bootstrap());
    },

    async menus(req, res) {
      res.sendCached(await content.menuList());
    },

    async menu(req, res) {
      res.sendCached(await content.menuById(req.params.id));
    },

    async articles(req, res) {
      const { category, limit, offset } = req.validatedQuery;
      res.sendCached(await content.articleList({ category, limit, offset }));
    },

    async article(req, res) {
      res.json(await content.articleBySlug(req.params.slug));
    },

    async taxonomy(req, res) {
      res.sendCached(await content.taxonomyAll());
    },

    async agenda(req, res) {
      res.sendCached(await content.agendaList());
    },

    async agendaState(req, res) {
      res.json(await content.agendaNow());
    },

    // Jejak kehadiran tidak boleh di-cache: isinya justru "siapa yang baru
    // saja lewat", dan jawaban semenit lalu sudah salah.
    async presence(req, res) {
      res.json(await content.presenceTrails());
    },

    // ── presence live ─────────────────────────────────────────────────────
    //
    // Server-Sent Events, bukan WebSocket: arahnya cuma satu — server memberi
    // tahu klien siapa saja yang sedang ada. Laporan balik dari klien lewat
    // POST /presence/here yang sudah punya rate limit sendiri.
    livePresence(req, res) {
      // Header ini yang membuatnya jadi SSE, bukan response biasa.
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Nginx menahan response di buffer secara bawaan, dan itu membuat SSE
        // tampak mati total tanpa satu pun error. Header ini mematikannya
        // tanpa perlu menyentuh konfigurasi nginx.
        'X-Accel-Buffering': 'no'
      });
      res.flushHeaders?.();

      const id = presenceHub.gabung(res);
      if (!id) {
        // Kapasitas penuh. Ditutup baik-baik, bukan dibiarkan menggantung —
        // klien akan mencoba lagi nanti lewat reconnect bawaan SSE.
        res.write('event: full\ndata: {}\n\n');
        return res.end();
      }

      // Koneksi bisa putus tanpa pemberitahuan apa pun; ini satu-satunya sinyal
      // yang bisa diandalkan bahwa orangnya sudah pergi.
      req.on('close', () => presenceHub.keluar(id));
    },

    hereNow(req, res) {
      const dikenal = presenceHub.pindah(req.body.id, req.body.planet ?? null);
      res.json({ ok: dikenal, jumlah: presenceHub.jumlah });
    },

    async recordPresence(req, res) {
      const menus = await content.menuList();
      const hasil = await participation.recordPresence({
        path: req.body.path,
        ipHash: ipHash(req),
        menuIds: new Set(menus.map((m) => m.id))
      });
      res.status(201).json(hasil);
    },

    async submitSparing(req, res) {
      const hasil = await participation.submitSparing({
        slug: req.params.slug,
        frequencyId: req.body.frequencyId,
        authorName: req.body.authorName,
        text: req.body.text,
        anchor: req.body.anchor,
        ipHash: ipHash(req)
      });
      res.status(201).json(hasil);
    },

    async boostSparing(req, res) {
      res.json(await participation.boostSparing(req.params.id));
    },

    async join(req, res) {
      // Respons datang apa adanya dari service, dan sengaja identik baik email
      // itu baru maupun sudah terdaftar — lihat catatan di submitJoin().
      const hasil = await participation.submitJoin({
        ...req.body,
        ipHash: ipHash(req),
        userAgent: req.get('user-agent')
      });
      res.status(201).json(hasil);
    },

    // ── langit komunitas ──────────────────────────────────────────────────
    async skyStars(req, res) {
      res.sendCached(await sky.daftar());
    },

    async myStar(req, res) {
      res.json(await sky.milikku(ipHash(req)));
    },

    async placeStar(req, res) {
      const hasil = await sky.taruh({ ...req.body, ipHash: ipHash(req) });
      res.status(201).json(hasil);
    },

    async settings(req, res) {
      res.sendCached(await content.publicSettings());
    }
  };
}
