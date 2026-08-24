// Controller dashboard. Sama tipisnya dengan yang publik; semua keputusan ada
// di service. Yang khas di sini cuma satu: `req.actor` selalu diteruskan,
// karena setiap perubahan harus tercatat siapa yang melakukannya.
export function makeAdminController({ menuAdmin, articleAdmin, curation, userAdmin, media, monitoring, sky, cache }) {
  return {
    // ── ringkasan ─────────────────────────────────────────────────────────
    async dashboard(req, res) {
      res.json({ ...(await curation.dashboard()), cacheEntries: cache.size });
    },

    // ── menu ──────────────────────────────────────────────────────────────
    async menuList(req, res) {
      res.json(await menuAdmin.list());
    },
    async menuGet(req, res) {
      res.json(await menuAdmin.byId(req.params.id));
    },
    async menuCreate(req, res) {
      res.status(201).json(await menuAdmin.create(req.body, req.actor));
    },
    async menuUpdate(req, res) {
      res.json(await menuAdmin.update(req.params.id, req.body, req.actor));
    },
    async menuDelete(req, res) {
      await menuAdmin.remove(req.params.id, req.actor);
      res.status(204).end();
    },
    async menuReorder(req, res) {
      res.json(await menuAdmin.reorder(req.body.order, req.actor));
    },

    // ── artikel ───────────────────────────────────────────────────────────
    async articleList(req, res) {
      res.json(await articleAdmin.list(req.validatedQuery));
    },
    async articleGet(req, res) {
      res.json(await articleAdmin.byId(req.params.id));
    },
    async articleCreate(req, res) {
      res.status(201).json(await articleAdmin.create(req.body, req.actor));
    },
    async articleUpdate(req, res) {
      res.json(await articleAdmin.update(req.params.id, req.body, req.actor));
    },
    async articleDelete(req, res) {
      await articleAdmin.remove(req.params.id, req.actor);
      res.status(204).end();
    },
    // Memperlihatkan hasil sanitasi sebelum disimpan. Editor WYSIWYG bisa
    // menempelkan apa saja; penulisnya berhak tahu bagian mana yang dibuang.
    async articlePreview(req, res) {
      res.json(articleAdmin.preview(req.body.html));
    },

    // ── agenda ────────────────────────────────────────────────────────────
    async agendaList(req, res) {
      res.json(await curation.agendaList());
    },
    async agendaCreate(req, res) {
      res.status(201).json(await curation.agendaCreate(req.body, req.actor));
    },
    async agendaUpdate(req, res) {
      res.json(await curation.agendaUpdate(req.params.id, req.body, req.actor));
    },
    async agendaDelete(req, res) {
      await curation.agendaRemove(req.params.id, req.actor);
      res.status(204).end();
    },

    // ── moderasi sparing ──────────────────────────────────────────────────
    async sparingList(req, res) {
      res.json(await curation.sparingList(req.validatedQuery));
    },
    async sparingModerate(req, res) {
      res.json(await curation.sparingModerate(req.params.id, req.body.status, req.actor));
    },
    async sparingDelete(req, res) {
      await curation.sparingRemove(req.params.id, req.actor);
      res.status(204).end();
    },

    // ── pendaftaran Gabung ────────────────────────────────────────────────
    async submissionList(req, res) {
      res.json(await curation.submissionList(req.validatedQuery));
    },
    async submissionUpdate(req, res) {
      res.json(await curation.submissionSetStatus(req.params.id, req.body.status, req.actor));
    },
    async submissionDelete(req, res) {
      await curation.submissionRemove(req.params.id, req.actor);
      res.status(204).end();
    },

    // ── taksonomi ─────────────────────────────────────────────────────────
    async taxonomy(req, res) {
      res.json(await curation.taxonomyAll());
    },
    async categoryUpsert(req, res) {
      res.json(await curation.categoryUpsert(req.body, req.actor));
    },
    async categoryDelete(req, res) {
      await curation.categoryRemove(req.params.id, req.actor);
      res.status(204).end();
    },
    async frequencyUpsert(req, res) {
      res.json(await curation.frequencyUpsert(req.body, req.actor));
    },

    // ── pengaturan ────────────────────────────────────────────────────────
    async settings(req, res) {
      res.json(await curation.settingsAll());
    },
    async settingSet(req, res) {
      res.json(await curation.settingSet(req.params.id, req.body.value, req.actor));
    },

    // ── langit komunitas ──────────────────────────────────────────────────
    async skyList(req, res) {
      res.json(await sky.daftarAdmin(req.validatedQuery));
    },
    async skyModerate(req, res) {
      res.json(await sky.moderasi(req.params.id, req.body.status, req.actor));
    },
    async skyDelete(req, res) {
      await sky.hapus(req.params.id, req.actor);
      res.status(204).end();
    },

    // ── jejak audit ───────────────────────────────────────────────────────
    async auditList(req, res) {
      res.json(await curation.auditList(req.validatedQuery));
    },

    // ── pemantauan ────────────────────────────────────────────────────────
    async monitorOverview(req, res) {
      res.json(await monitoring.ikhtisar(req.validatedQuery));
    },
    async monitorEvents(req, res) {
      const { jam, ...sisa } = req.validatedQuery;
      res.json(await monitoring.daftarKejadian({
        ...sisa,
        sejak: jam ? new Date(Date.now() - jam * 3_600_000) : null
      }));
    },
    async monitorDatabase(req, res) {
      res.json(await monitoring.kesehatanDatabase());
    },

    // ── akun admin ────────────────────────────────────────────────────────
    async userList(req, res) {
      res.json(await userAdmin.list());
    },
    async userCreate(req, res) {
      res.status(201).json(await userAdmin.create(req.body, req.actor));
    },
    async userUpdate(req, res) {
      res.json(await userAdmin.update(req.params.id, req.body, req.actor));
    },
    async userDelete(req, res) {
      await userAdmin.remove(req.params.id, req.actor);
      res.status(204).end();
    },

    // ── media ─────────────────────────────────────────────────────────────
    async mediaList(req, res) {
      res.json(await media.list(req.validatedQuery));
    },
    async mediaUpload(req, res) {
      res.status(201).json(await media.register(req.file, req.actor));
    },
    async mediaDelete(req, res) {
      await media.remove(req.params.id, req.actor);
      res.status(204).end();
    },

    // ── perkakas ──────────────────────────────────────────────────────────
    // Tombol darurat kalau ada yang terasa basi. Cache-nya sudah dibatalkan
    // otomatis di setiap tulisan, jadi ini seharusnya jarang dipakai — kalau
    // sering dipakai, ada pembatalan yang terlewat dan itu yang harus dibetulkan.
    async cacheClear(req, res) {
      res.json({ cleared: cache.clear() });
    }
  };
}
