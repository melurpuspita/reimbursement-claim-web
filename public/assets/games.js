// Dua mini game: Pocong Loncat (untuk approve) dan Usir Kuntilanak (untuk reject).
(function () {
  const { Sfx } = FX;
  const overlayHtml = '<div class="overlay"><div class="ov-title"></div><div class="ov-sub"></div><button class="btn ov-btn" type="button"></button></div>';
  function overlay(root) {
    const el = root.querySelector(".overlay");
    return {
      show(title, sub, btn, onClick) {
        el.querySelector(".ov-title").textContent = title;
        el.querySelector(".ov-sub").textContent = sub;
        const b = el.querySelector(".ov-btn");
        b.style.display = btn ? "" : "none";
        b.textContent = btn || "";
        b.onclick = onClick || null;
        el.classList.add("show");
        if (btn) b.focus({ preventScroll: true });
      },
      hide() { el.classList.remove("show"); },
    };
  }

  // =========================================================
  // POCONG LONCAT: lompati batu nisan, capai target untuk approve
  // =========================================================
  function PocongRun(root, { goal = 10, onWin }) {
    root.innerHTML = `<div class="game pocong-game">
      <div class="game-hud"><span>Batu nisan terlewati: <b class="score">0</b>/${goal}</span><span class="hint">SPASI / panah atas / tap = loncat</span></div>
      <div class="canvas-wrap"><canvas width="640" height="240"></canvas>${overlayHtml}</div>
      <button class="btn jump-btn" type="button">LONCAT!</button></div>`;
    const canvas = root.querySelector("canvas"), g = canvas.getContext("2d");
    const scoreEl = root.querySelector(".score"), ov = overlay(root), wrap = root.querySelector(".canvas-wrap");
    const W = 640, GY = 200, PX = 80, PW = 36, PH = 54;
    const sprite = new Image();
    sprite.src = Mascots.dataUrl(Mascots.pocong({ w: 72, h: 108 }));
    const stars = Array.from({ length: 28 }, (_, i) => ({ x: (i * 97) % W, y: (i * 41) % 120, r: 1 + (i % 3) * 0.6 }));

    let state = "ready", score = 0, h = 0, vh = 0, obstacles = [], toNext = 0, ground = 0, destroyed = false, raf = 0, last = 0;

    function reset() { score = 0; h = 0; vh = 0; obstacles = []; toNext = 260; ground = 0; scoreEl.textContent = "0"; }
    function jump() {
      if (state === "ready") return startGame();
      if (state === "playing" && h === 0) { vh = 13.5; h = 0.01; Sfx.play("jump"); }
    }
    function startGame() { reset(); state = "playing"; ov.hide(); }
    function die() {
      state = "dead"; Sfx.play("hit"); FX.shake(wrap);
      ov.show("Kepleset batu nisan!", `Baru ${score} dari ${goal}. Pocongnya masih belajar loncat.`, "Coba lagi", startGame);
    }
    function win() {
      state = "won"; Sfx.play("win");
      ov.show("ARWAH TENANG!", "Pocong sukses loncat. Klaim disetujui...", null);
      setTimeout(() => !destroyed && onWin && onWin(), 900);
    }

    function spawn() {
      const w = 26 + Math.random() * 12, hh = 34 + Math.random() * 16;
      obstacles.push({ x: W + 10, w, h: hh, passed: false });
      if (score >= 3 && Math.random() < 0.25) obstacles.push({ x: W + 10 + w + 6, w: 24, h: 30 + Math.random() * 10, passed: false });
      toNext = 300 + Math.random() * 200;
    }

    function update(dt) {
      if (state !== "playing") return;
      const speed = Math.min(7.2, 5 + score * 0.22);
      if (h > 0) {
        h += vh * dt; vh -= 0.75 * dt;
        if (h <= 0) { h = 0; vh = 0; }
      }
      ground = (ground + speed * dt) % 40;
      toNext -= speed * dt;
      if (toNext <= 0) spawn();
      for (const o of obstacles) {
        o.x -= speed * dt;
        if (!o.passed && o.x + o.w < PX) {
          o.passed = true; score++; scoreEl.textContent = score; Sfx.play("point");
          if (score >= goal) return win();
        }
        const px1 = PX + 8, px2 = PX + PW - 8, py2 = GY - h - 2;
        if (px2 > o.x && px1 < o.x + o.w && py2 > GY - o.h) return die();
      }
      obstacles = obstacles.filter((o) => o.x + o.w > -10);
    }

    function draw(t) {
      const sky = g.createLinearGradient(0, 0, 0, GY);
      sky.addColorStop(0, "#1b1233"); sky.addColorStop(1, "#4a2a7a");
      g.fillStyle = sky; g.fillRect(0, 0, W, 240);
      g.fillStyle = "#fff"; for (const s of stars) { g.globalAlpha = 0.5 + 0.5 * Math.sin(t / 400 + s.x); g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      g.fillStyle = "#fff3b0"; g.beginPath(); g.arc(560, 50, 26, 0, 7); g.fill();
      g.fillStyle = "#e6d98f"; g.beginPath(); g.arc(551, 44, 5, 0, 7); g.arc(568, 58, 7, 0, 7); g.fill();
      g.fillStyle = "#2a1d4e"; g.fillRect(0, GY, W, 40);
      g.strokeStyle = "#6b5aa6"; g.lineWidth = 3; g.beginPath(); g.moveTo(0, GY); g.lineTo(W, GY); g.stroke();
      g.strokeStyle = "#4b3f7a"; g.lineWidth = 2;
      for (let x = -ground; x < W; x += 40) { g.beginPath(); g.moveTo(x, GY + 14); g.lineTo(x + 16, GY + 14); g.stroke(); }

      for (const o of obstacles) {
        g.fillStyle = "#9c93c9"; g.strokeStyle = "#4b3f7a"; g.lineWidth = 3;
        g.beginPath(); g.moveTo(o.x, GY); g.lineTo(o.x, GY - o.h + o.w / 2);
        g.arc(o.x + o.w / 2, GY - o.h + o.w / 2, o.w / 2, Math.PI, 0); g.lineTo(o.x + o.w, GY); g.closePath(); g.fill(); g.stroke();
        if (o.w >= 30) { g.fillStyle = "#4b3f7a"; g.font = "bold 10px sans-serif"; g.textAlign = "center"; g.fillText("RIP", o.x + o.w / 2, GY - o.h + o.w / 2 + 12); }
      }

      // Pocong: di tanah dia loncat-loncat kecil (bobbing), di udara miring sedikit.
      const bob = h === 0 && state === "playing" ? Math.abs(Math.sin(t / 110)) * 5 : 0;
      const top = GY - h - PH - bob;
      g.save(); g.translate(PX + PW / 2, top + PH); g.rotate(h > 0 ? -vh * 0.012 : 0);
      if (sprite.complete && sprite.naturalWidth) g.drawImage(sprite, -PW / 2, -PH, PW, PH);
      else { g.fillStyle = "#fff"; g.fillRect(-PW / 2, -PH, PW, PH); }
      g.restore();
      g.textAlign = "start";
    }

    function frame(t) {
      if (destroyed) return;
      const dt = Math.min(2.5, (t - last) / 16.67 || 1); last = t;
      update(dt); draw(t); raf = requestAnimationFrame(frame);
    }
    function onKey(e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); jump(); }
    }
    document.addEventListener("keydown", onKey);
    wrap.addEventListener("pointerdown", (e) => { if (!e.target.closest(".ov-btn")) jump(); });
    root.querySelector(".jump-btn").addEventListener("pointerdown", jump);

    reset();
    ov.show("Pocong Loncat", `Lompati ${goal} batu nisan tanpa kepleset untuk menyetujui klaim.`, "Mulai", startGame);
    raf = requestAnimationFrame(frame);
    const handle = {
      destroy() { destroyed = true; cancelAnimationFrame(raf); document.removeEventListener("keydown", onKey); },
      peek: () => ({ state, h, score, obstacles: obstacles.map((o) => ({ x: o.x, w: o.w, h: o.h })) }), // untuk tes otomatis
    };
    root.__game = handle;
    return handle;
  }

  // =========================================================
  // USIR KUNTILANAK: tepuk kuntilanak yang muncul, jangan pukul labu
  // =========================================================
  function UsirKunti(root, { goal = 8, seconds = 20, onWin }) {
    root.innerHTML = `<div class="game usir-game">
      <div class="game-hud"><span>Hantu terusir: <b class="score">0</b>/${goal}</span><span>Sisa waktu: <b class="time">${seconds}</b>d</span></div>
      <div class="grid-wrap"><div class="graves">${Array.from({ length: 9 }, () => '<button class="grave" type="button"><span class="ghost-slot"></span><span class="mound"></span></button>').join("")}</div>${overlayHtml}</div>
      <p class="muted small">Tepuk kuntilanak. Jangan tepuk labu, nanti poin berkurang.</p></div>`;
    const cells = [...root.querySelectorAll(".grave")], ov = overlay(root), wrap = root.querySelector(".grid-wrap");
    const scoreEl = root.querySelector(".score"), timeEl = root.querySelector(".time");
    let state = "ready", score = 0, left = seconds, spawnT = 0, tickT = 0, destroyed = false;
    const occ = new Array(9).fill(null);

    function clearCell(i) {
      if (!occ[i]) return;
      clearTimeout(occ[i].t); occ[i] = null;
      cells[i].classList.remove("up", "kunti", "pumpkin");
    }
    function stop() { clearTimeout(spawnT); clearInterval(tickT); occ.forEach((_, i) => clearCell(i)); }
    function fail() {
      state = "over"; stop(); Sfx.play("hit");
      ov.show("Kuntilanaknya kabur!", `Baru ${score} dari ${goal}. Waktu habis.`, "Coba lagi", start);
    }
    function win() {
      state = "won"; stop(); Sfx.play("win");
      ov.show("USIR SUKSES!", "Kuntilanak kabur ke alam lain. Menolak klaim...", null);
      setTimeout(() => !destroyed && onWin && onWin(), 900);
    }
    function spawn() {
      if (state !== "playing") return;
      const free = occ.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
      if (free.length > 7) { /* selalu ada ruang */ }
      if (free.length && occ.filter(Boolean).length < 3) {
        const i = free[(Math.random() * free.length) | 0];
        const type = Math.random() < 0.78 ? "kunti" : "pumpkin";
        const slot = cells[i].querySelector(".ghost-slot");
        slot.innerHTML = type === "kunti" ? Mascots.kuntilanak({ w: 56, h: 84 }) : Mascots.pumpkin({ w: 56, h: 56 });
        cells[i].classList.add("up", type);
        occ[i] = { type, t: setTimeout(() => clearCell(i), Math.max(650, 1100 - score * 45)) };
      }
      spawnT = setTimeout(spawn, Math.max(360, 700 - score * 35));
    }
    function hit(i) {
      if (state !== "playing" || !occ[i]) return;
      const type = occ[i].type;
      clearCell(i);
      if (type === "kunti") {
        score++; Sfx.play("hihi");
      } else {
        score = Math.max(0, score - 1); Sfx.play("boo"); FX.shake(wrap);
      }
      scoreEl.textContent = score;
      if (score >= goal) win();
    }
    function start() {
      stop(); score = 0; left = seconds; scoreEl.textContent = "0"; timeEl.textContent = left; state = "playing"; ov.hide();
      tickT = setInterval(() => { left = Math.max(0, +(left - 0.1).toFixed(1)); timeEl.textContent = Math.ceil(left); if (left <= 0 && state === "playing") fail(); }, 100);
      spawn();
    }
    cells.forEach((c, i) => c.addEventListener("pointerdown", (e) => { e.preventDefault(); hit(i); }));
    ov.show("Usir Kuntilanak", `Tepuk ${goal} kuntilanak dalam ${seconds} detik untuk menolak klaim.`, "Mulai", start);
    return { destroy() { destroyed = true; stop(); } };
  }

  window.Games = { PocongRun, UsirKunti };
})();
