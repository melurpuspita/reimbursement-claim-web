// Web App HantuKlaim. Semua data dari API dirender lewat textContent (tidak pernah innerHTML),
// jadi teks di struk atau deskripsi klaim tidak bisa menyuntik HTML/script.
(function () {
  const { Sfx, toast, confetti } = FX;
  const root = document.getElementById("root");
  const state = { me: null, claims: [], tokens: [], users: [], view: "claims", filter: "all", q: "", from: "", to: "" };
  let resultsEl = null;

  const STATUS = {
    pending: { label: "👻 Gentayangan", hint: "menunggu keputusan" },
    approved: { label: "😇 Arwah Tenang", hint: "disetujui" },
    rejected: { label: "🧹 Diusir", hint: "ditolak" },
  };
  const CATEGORY = { transport: "Transport", makan: "Makan", bensin: "Bensin", parkir: "Parkir", akomodasi: "Akomodasi", lainnya: "Lainnya" };
  const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");
  const fmtDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

  // ---------- util DOM ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const svgNode = (html) => { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; };

  async function api(method, path, body, raw) {
    const init = { method, headers: {} };
    if (body !== undefined && !raw) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
    if (raw) { init.headers["Content-Type"] = raw.type; init.body = raw.body; }
    const res = await fetch(path, init);
    if (res.status === 401) { location.href = "/login"; throw new Error("Sesi habis"); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Terjadi kesalahan");
    return data;
  }

  // ---------- modal ----------
  function openModal(content, onClose) {
    const bg = h("div", { class: "modal-bg" });
    const modal = h("div", { class: "modal", role: "dialog", "aria-modal": "true" }, content);
    bg.append(modal);
    let closed = false;
    const close = () => { if (closed) return; closed = true; document.removeEventListener("keydown", esc); bg.remove(); onClose && onClose(); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    bg.addEventListener("pointerdown", (e) => { if (e.target === bg) close(); });
    document.addEventListener("keydown", esc);
    document.body.append(bg);
    return { close, modal, setContent(n) { modal.replaceChildren(n); } };
  }
  const modalHead = (title, close, mascot) =>
    h("div", { class: "modal-head" }, mascot ? svgNode(mascot) : null, h("h2", {}, title), h("span", { class: "spacer" }), h("button", { class: "btn ghost", type: "button", onclick: close, "aria-label": "Tutup" }, "✕"));

  // ---------- data ----------
  // Filter yang dikirim ke server (status difilter di sisi tampilan, tapi ikut ke CSV).
  function claimsParams() {
    const p = new URLSearchParams();
    if (state.q.trim()) p.set("q", state.q.trim());
    if (state.from) p.set("from", state.from);
    if (state.to) p.set("to", state.to);
    return p;
  }
  const filtersActive = () => !!(state.q.trim() || state.from || state.to || state.filter !== "all");

  async function load() {
    const jobs = [api("GET", "/api/claims?" + claimsParams())];
    if (state.me.role === "admin") jobs.push(api("GET", "/api/tokens"), api("GET", "/api/users"));
    const [c, t, u] = await Promise.all(jobs);
    state.claims = c.claims;
    if (t) state.tokens = t.tokens;
    if (u) state.users = u.users;
    render();
  }

  // ---------- render utama ----------
  function render() {
    const isAdmin = state.me.role === "admin";
    const topbar = h("div", { class: "topbar" },
      h("div", { class: "logo" }, svgNode(Mascots.ghost({ w: 40, h: 48 })), "HantuKlaim"),
      h("div", { class: "spacer" }),
      h("span", { class: "chip" }, state.me.name, h("span", { class: "role-" + state.me.role }, isAdmin ? "admin finance" : "sales")),
      h("button", { class: "btn ghost", onclick: logout }, "Keluar"),
    );

    const tabs = h("div", { class: "tabs" },
      tab("claims", isAdmin ? "Semua klaim" : "Klaim saya"),
      isAdmin ? tab("tokens", "Token Claude Code") : null,
      h("span", { class: "spacer" }),
      h("button", { class: "btn orange", onclick: () => openClaimForm() }, "+ Ajukan klaim"),
    );

    const body = state.view === "tokens" && isAdmin ? renderTokens() : renderClaims();
    root.replaceChildren(topbar, tabs, body);
  }
  const tab = (id, label) => h("button", { class: "tab" + (state.view === id ? " active" : ""), onclick: () => { state.view = id; Sfx.play("click"); render(); } }, label);

  async function logout() {
    await api("POST", "/api/logout").catch(() => {});
    location.href = "/login";
  }

  // ---------- daftar klaim ----------
  function renderClaims() {
    let timer;
    const search = h("input", { type: "search", class: "grow", maxlength: "100", placeholder: "Cari merchant atau catatan, misal: taksi", "aria-label": "Cari klaim", value: state.q });
    const from = h("input", { type: "date", "aria-label": "Dari tanggal transaksi", value: state.from });
    const to = h("input", { type: "date", "aria-label": "Sampai tanggal transaksi", value: state.to });
    search.addEventListener("input", () => { state.q = search.value; clearTimeout(timer); timer = setTimeout(applyFilters, 300); });
    const onDate = () => { state.from = from.value; state.to = to.value; applyFilters(); };
    from.addEventListener("change", onDate); to.addEventListener("change", onDate);
    const reset = () => { state.q = state.from = state.to = ""; state.filter = "all"; search.value = from.value = to.value = ""; applyFilters(); };
    const toolbar = h("div", { class: "toolbar" },
      search,
      h("label", { class: "dt" }, "Dari", from), h("label", { class: "dt" }, "Sampai", to),
      h("button", { class: "btn ghost", type: "button", onclick: reset }, "Reset"),
      h("button", { class: "btn green", type: "button", onclick: downloadCsv }, "Unduh CSV"));
    resultsEl = h("div", {});
    resultsEl.append(renderResults());
    return h("div", {}, toolbar, resultsEl);
  }

  function refreshResults() { if (resultsEl && resultsEl.isConnected) resultsEl.replaceChildren(renderResults()); }

  async function applyFilters() {
    if (state.from && state.to && state.from > state.to) { toast("Tanggal 'Dari' tidak boleh setelah 'Sampai'", "err"); return; }
    try {
      state.claims = (await api("GET", "/api/claims?" + claimsParams())).claims;
      refreshResults();
    } catch (e) { toast(e.message, "err"); }
  }

  async function downloadCsv() {
    const p = claimsParams();
    if (state.filter !== "all") p.set("status", state.filter);
    const res = await fetch("/api/claims.csv?" + p);
    if (res.status === 401) { location.href = "/login"; return; }
    if (!res.ok) { const d = await res.json().catch(() => ({})); toast(d.error || "Gagal mengunduh CSV", "err"); Sfx.play("hit"); return; }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "klaim.csv";
    const url = URL.createObjectURL(await res.blob());
    const a = h("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Sfx.play("win"); toast(`CSV diunduh: ${name}`, "ok");
  }

  function renderResults() {
    const all = state.claims;
    const sum = (arr) => arr.reduce((a, c) => a + c.amount_idr, 0);
    const pending = all.filter((c) => c.status === "pending"), approved = all.filter((c) => c.status === "approved");
    const stats = h("div", { class: "stats" },
      h("div", { class: "stat" }, "Hantu gentayangan", h("b", {}, String(pending.length))),
      h("div", { class: "stat" }, "Nominal menunggu", h("b", {}, rupiah(sum(pending)))),
      h("div", { class: "stat" }, "Sudah cair (arwah tenang)", h("b", {}, rupiah(sum(approved)))),
    );
    const filters = h("div", { class: "tabs" },
      ...[["all", "Semua"], ["pending", "Gentayangan"], ["approved", "Arwah Tenang"], ["rejected", "Diusir"]].map(([id, label]) =>
        h("button", { class: "tab" + (state.filter === id ? " active" : ""), onclick: () => { state.filter = id; refreshResults(); } }, label)),
    );
    const shown = state.filter === "all" ? all : all.filter((c) => c.status === state.filter);
    const list = shown.length
      ? h("div", { class: "grid" }, shown.map(claimCard))
      : h("div", { class: "empty" }, svgNode(Mascots.ghost({ w: 90, h: 108 })),
          h("p", {}, filtersActive() ? "Nggak ada hantu yang cocok dengan filter ini." : "Belum ada klaim di sini. Hantunya lagi nganggur."));
    return h("div", {}, stats, filters, h("p", { class: "muted small", "aria-live": "polite" }, `${shown.length} klaim ditemukan`), list);
  }

  function claimCard(c) {
    const isAdmin = state.me.role === "admin";
    return h("article", { class: "card" },
      h("span", { class: "badge " + c.status }, STATUS[c.status].label),
      h("h3", { style: "margin-top:8px" }, c.merchant),
      h("div", { class: "amount" }, rupiah(c.amount_idr)),
      h("div", { class: "meta" },
        h("span", {}, "#" + c.id), h("span", {}, fmtDate(c.spent_on)), h("span", { class: "tag" }, CATEGORY[c.category] || c.category),
        isAdmin ? h("span", {}, "oleh " + c.owner_name) : null,
        c.has_receipt ? h("span", {}, "📎 ada struk") : null,
        c.source === "mcp" ? h("span", { class: "tag" }, "via Claude Code") : null),
      h("div", { class: "actions" },
        h("button", { class: "btn ghost", onclick: () => openDetail(c) }, "Detail"),
        isAdmin && c.status === "pending" ? h("button", { class: "btn green", onclick: () => startApprove(c) }, "Approve") : null,
        isAdmin && c.status === "pending" ? h("button", { class: "btn red", onclick: () => startReject(c) }, "Tolak") : null,
        isAdmin ? h("button", { class: "btn ghost", onclick: () => openClaimForm(c) }, "Edit") : null,
        isAdmin ? h("button", { class: "btn ghost", onclick: () => confirmDelete(c) }, "Hapus") : null),
    );
  }

  function openDetail(c) {
    const m = openModal(null);
    const rows = [["Status", STATUS[c.status].label], ["Pemilik", c.owner_name], ["Tanggal", fmtDate(c.spent_on)], ["Kategori", CATEGORY[c.category] || c.category],
      ["Nominal", rupiah(c.amount_idr)], ["Deskripsi", c.description || "-"], ["Diajukan via", c.source === "mcp" ? "Claude Code (MCP)" : "Web App"]];
    if (c.decision_note) rows.push(["Catatan finance", c.decision_note]);
    const dl = h("dl", { class: "kv" }, rows.map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
    m.setContent(h("div", {}, modalHead(c.merchant + " (#" + c.id + ")", m.close), dl,
      c.has_receipt ? h("img", { class: "receipt-img", src: "/api/claims/" + c.id + "/receipt", alt: "Foto struk" }) : h("p", { class: "muted" }, "Belum ada foto struk.")));
  }

  // ---------- form klaim (baru / edit) ----------
  function openClaimForm(existing) {
    const m = openModal(null);
    const f = {
      merchant: h("input", { required: true, maxlength: "80", placeholder: "Contoh: Warung Kopi Kuntilanak", value: existing?.merchant || "" }),
      amount: h("input", { type: "number", required: true, min: "1", step: "1", placeholder: "85000", value: existing?.amount_idr || "" }),
      date: h("input", { type: "date", required: true, value: existing?.spent_on || new Date().toISOString().slice(0, 10) }),
      cat: h("select", {}, Object.entries(CATEGORY).map(([k, v]) => h("option", { value: k, selected: existing?.category === k }, v))),
      desc: h("textarea", { rows: "3", maxlength: "500", placeholder: "Untuk apa pengeluaran ini?" }),
      file: h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" }),
    };
    f.desc.value = existing?.description || "";
    const err = h("p", { class: "error", role: "alert" });
    const submit = h("button", { class: "btn orange", type: "submit" }, existing ? "Simpan perubahan" : "Kirim klaim");
    const form = h("form", {},
      modalHead(existing ? "Edit klaim #" + existing.id : "Ajukan klaim baru", m.close, Mascots.kuntilanak({ w: 34, h: 51 })),
      h("label", {}, "Merchant"), f.merchant,
      h("div", { class: "row" }, h("div", {}, h("label", {}, "Nominal (Rp)"), f.amount), h("div", {}, h("label", {}, "Tanggal transaksi"), f.date)),
      h("label", {}, "Kategori"), f.cat,
      h("label", {}, "Deskripsi"), f.desc,
      existing ? null : [h("label", {}, "Foto struk (opsional, maks 5 MB)"), f.file],
      err, h("div", { class: "actions" }, submit, h("button", { class: "btn ghost", type: "button", onclick: m.close }, "Batal")));
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); err.textContent = ""; submit.disabled = true;
      const payload = { merchant: f.merchant.value, amount_idr: Number(f.amount.value), spent_on: f.date.value, category: f.cat.value, description: f.desc.value };
      try {
        if (existing) await api("PATCH", "/api/claims/" + existing.id, payload);
        else {
          const { claim } = await api("POST", "/api/claims", payload);
          const file = f.file.files[0];
          if (file) await api("PUT", "/api/claims/" + claim.id + "/receipt", undefined, { type: file.type, body: file });
        }
        m.close(); Sfx.play("win"); toast(existing ? "Klaim diperbarui" : "Klaim terkirim, hantunya menunggu finance", "ok");
        await load();
      } catch (ex) { err.textContent = ex.message; submit.disabled = false; FX.shake(m.modal); }
    });
    m.setContent(form);
  }

  function confirmDelete(c) {
    const m = openModal(null);
    m.setContent(h("div", {}, modalHead("Hapus klaim #" + c.id + "?", m.close, Mascots.ghost({ w: 34, h: 41 })),
      h("p", {}, `Klaim "${c.merchant}" ${rupiah(c.amount_idr)} akan dihapus permanen beserta foto struknya.`),
      h("div", { class: "actions" },
        h("button", { class: "btn red", onclick: async () => { try { await api("DELETE", "/api/claims/" + c.id); m.close(); toast("Klaim dihapus", "ok"); await load(); } catch (e) { toast(e.message, "err"); } } }, "Ya, hapus"),
        h("button", { class: "btn ghost", onclick: m.close }, "Batal"))));
  }

  // ---------- approve: Pocong Loncat ----------
  function startApprove(c) {
    let game;
    const m = openModal(null, () => game && game.destroy());
    const gameRoot = h("div", {});
    m.setContent(h("div", {}, modalHead("Approve #" + c.id + ": loncatin dulu!", m.close, Mascots.pocong({ w: 34, h: 51 })),
      h("p", { class: "muted" }, `${c.merchant} | ${rupiah(c.amount_idr)} | ${c.owner_name}. Pocong harus loncat 10 batu nisan sebelum klaim ini boleh cair.`), gameRoot));
    game = Games.PocongRun(gameRoot, {
      goal: 10,
      onWin: async () => {
        try {
          await api("POST", "/api/claims/" + c.id + "/approve", {});
          m.close(); confetti(); Sfx.play("win"); toast(`Klaim #${c.id} cair. Arwah tenang!`, "ok");
          await load();
        } catch (e) { m.close(); toast(e.message, "err"); await load(); }
      },
    });
  }

  // ---------- reject: Usir Kuntilanak ----------
  function startReject(c) {
    let game;
    const m = openModal(null, () => game && game.destroy());
    const note = h("textarea", { rows: "3", maxlength: "300", placeholder: "Alasan penolakan (wajib), misal: struk tidak terbaca" });
    const err = h("p", { class: "error", role: "alert" });
    const gameRoot = h("div", {});
    const step1 = h("div", {},
      modalHead("Tolak #" + c.id, m.close, Mascots.kuntilanak({ w: 34, h: 51 })),
      h("p", { class: "muted" }, `${c.merchant} | ${rupiah(c.amount_idr)} | ${c.owner_name}`),
      h("label", {}, "Alasan penolakan"), note, err,
      h("div", { class: "actions" }, h("button", { class: "btn red", onclick: () => {
        const text = note.value.trim();
        if (text.length < 3) { err.textContent = "Alasan minimal 3 karakter, jangan cuma 'hihihi'."; FX.shake(m.modal); return; }
        m.setContent(h("div", {}, modalHead("Usir kuntilanak dulu!", m.close, Mascots.kuntilanak({ w: 34, h: 51 })), h("p", { class: "muted" }, "Klaim baru ditolak setelah kuntilanaknya terusir."), gameRoot));
        game = Games.UsirKunti(gameRoot, {
          goal: 8, seconds: 20,
          onWin: async () => {
            try {
              await api("POST", "/api/claims/" + c.id + "/reject", { note: text });
              m.close(); Sfx.play("boo"); toast(`Klaim #${c.id} diusir ke alam lain`, "ok");
              await load();
            } catch (e) { m.close(); toast(e.message, "err"); await load(); }
          },
        });
      } }, "Lanjut ke arena usir hantu"), h("button", { class: "btn ghost", onclick: m.close }, "Batal")));
    m.setContent(step1);
  }

  // ---------- token (admin) ----------
  function renderTokens() {
    const sales = state.users.filter((u) => u.role === "sales");
    const who = h("select", {}, sales.map((u) => h("option", { value: u.id }, u.name)));
    const label = h("input", { placeholder: "Label, misal: Claude Code laptop Rina", maxlength: "60" });
    const err = h("p", { class: "error" });
    const issue = h("form", { class: "card", style: "margin-bottom:16px" },
      h("h3", {}, "Terbitkan token baru"), h("p", { class: "muted small" }, "Token dipakai MCP ops-finance di Claude Code. Hanya tampil sekali."),
      h("div", { class: "row" }, h("div", {}, h("label", {}, "Untuk"), who), h("div", {}, h("label", {}, "Label"), label)), err,
      h("div", { class: "actions" }, h("button", { class: "btn orange", type: "submit" }, "Terbitkan")));
    issue.addEventListener("submit", async (e) => {
      e.preventDefault(); err.textContent = "";
      try {
        const res = await api("POST", "/api/tokens", { user_id: Number(who.value), label: label.value });
        const m = openModal(null);
        m.setContent(h("div", {}, modalHead("Token baru", m.close, Mascots.ghost({ w: 34, h: 41 })),
          h("p", {}, "Salin sekarang. Setelah modal ini ditutup, token tidak bisa dilihat lagi."), h("div", { class: "token-box" }, res.token),
          h("div", { class: "actions" }, h("button", { class: "btn green", onclick: () => navigator.clipboard?.writeText(res.token).then(() => toast("Token disalin", "ok")) }, "Salin"))));
        await load();
      } catch (ex) { err.textContent = ex.message; }
    });
    const rows = state.tokens.map((t) => h("tr", {},
      h("td", {}, t.label), h("td", {}, t.owner_name), h("td", {}, (t.created_at || "").slice(0, 10)),
      h("td", {}, t.revoked_at ? h("span", { class: "badge rejected" }, "Dicabut") : h("span", { class: "badge approved" }, "Aktif")),
      h("td", {}, t.revoked_at ? null : h("button", { class: "btn red", style: "padding:4px 12px", onclick: async () => {
        try { await api("DELETE", "/api/tokens/" + t.id); Sfx.play("boo"); toast("Token dicabut. Claude Code-nya ditendang.", "ok"); await load(); } catch (e) { toast(e.message, "err"); }
      } }, "Cabut"))));
    return h("div", {}, issue, h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ["Label", "Pemilik", "Dibuat", "Status", ""].map((x) => h("th", {}, x)))), h("tbody", {}, rows))));
  }

  // ---------- start ----------
  (async function init() {
    try { state.me = (await api("GET", "/api/me")).user; } catch { return; }
    FX.ambient(); FX.soundButton();
    await load();
    toast(`Halo ${state.me.name}! Hantunya sudah nungguin.`, "info");
  })();
})();
