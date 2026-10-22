// Efek heboh: suara, konfeti, toast, hantu melayang, pocong lewat.
(function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  // ---------- suara (WebAudio, tanpa file) ----------
  let ctx = null;
  let muted = store.get("hk_muted") === "1";
  function tone(freq, start, dur, type = "square", vol = 0.06) {
    if (muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      const t = ctx.currentTime + start;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch {}
  }
  const SOUNDS = {
    jump: () => { tone(330, 0, 0.08); tone(520, 0.06, 0.1); },
    point: () => tone(880, 0, 0.07, "triangle"),
    hit: () => { tone(180, 0, 0.15, "sawtooth"); tone(110, 0.1, 0.25, "sawtooth"); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.18, "triangle", 0.08)),
    boo: () => { tone(220, 0, 0.12, "sawtooth"); tone(330, 0.1, 0.12, "sawtooth"); tone(440, 0.2, 0.2, "sawtooth"); },
    hihi: () => [900, 1100, 900, 1200].forEach((f, i) => tone(f, i * 0.07, 0.07, "sine", 0.07)),
    click: () => tone(600, 0, 0.04, "triangle", 0.04),
  };
  const Sfx = {
    play(n) { (SOUNDS[n] || (() => {}))(); },
    get muted() { return muted; },
    toggle() { muted = !muted; store.set("hk_muted", muted ? "1" : "0"); return muted; },
  };

  // ---------- toast ----------
  function toast(msg, kind = "info") {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + kind;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add("out"), 3400);
    setTimeout(() => t.remove(), 3900);
  }

  // ---------- konfeti hantu ----------
  function confetti(count = 140) {
    const c = document.createElement("canvas");
    c.className = "confetti";
    c.width = innerWidth; c.height = innerHeight;
    document.body.appendChild(c);
    const g = c.getContext("2d");
    const icons = ["👻", "🎃", "🦇", "✨", "💀", "🕯️"];
    const colors = ["#ff9f43", "#ff7eb6", "#9b7bff", "#7cffcb", "#fff3b0"];
    const ps = Array.from({ length: count }, () => ({
      x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.6,
      vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 4, r: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3, icon: Math.random() < 0.4 ? icons[(Math.random() * icons.length) | 0] : null,
      color: colors[(Math.random() * colors.length) | 0], size: 10 + Math.random() * 16,
    }));
    let frames = 0;
    (function tick() {
      g.clearRect(0, 0, c.width, c.height);
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r);
        if (p.icon) { g.font = p.size + "px serif"; g.fillText(p.icon, 0, 0); }
        else { g.fillStyle = p.color; g.fillRect(-4, -4, 8, 8); }
        g.restore();
      }
      if (++frames < 240) requestAnimationFrame(tick); else c.remove();
    })();
  }

  function shake(el) {
    el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  }

  // ---------- latar: hantu melayang + hantu jalan-jalan ----------
  const JOKES = [
    "Approve dong... aku udah gentayangan 3 hari nunggu klaim ini.",
    "Struknya bukan struk beneran? Hihihi, aku juga bukan hantu beneran.",
    "Kalau ditolak, aku diusir ke alam lain. Tolong kasih alasan yang sopan ya.",
    "Pocong aja bisa loncat 10 kali, masa kamu nggak sanggup approve?",
    "Jangan lupa kopi. Kuntilanak ngopinya tengah malam.",
    "Aku tuh cuma mau reimburse parkir kuburan. Rp 5.000 doang.",
    "Psst... saldo kas lagi tipis, tapi arwah tetap harus tenang.",
    "Kalau dengar suara 'hihihi' dari laptop, itu bukan bug. Itu fitur.",
  ];
  function ambient() {
    const bg = document.createElement("div");
    bg.className = "bg-ghosts";
    const kinds = ["ghost", "kuntilanak", "pocong", "ghost", "pocong", "kuntilanak", "ghost"];
    kinds.forEach((k, i) => {
      const d = document.createElement("div");
      d.className = "floaty";
      const size = 36 + ((i * 17) % 40);
      d.style.cssText = `left:${(i * 14 + 5) % 95}%;top:${(i * 23 + 8) % 80}%;animation-duration:${14 + ((i * 5) % 12)}s;animation-delay:${-i * 2.3}s;opacity:${0.12 + (i % 3) * 0.05}`;
      d.innerHTML = Mascots[k]({ w: size, h: size * 1.4 });
      bg.appendChild(d);
    });
    document.body.prepend(bg);

    // Pocong loncat-loncat di bawah layar, bisa diklik.
    const hopper = document.createElement("button");
    hopper.className = "hopper"; hopper.title = "Klik aku";
    hopper.innerHTML = Mascots.pocong({ w: 54, h: 81 }) + '<span class="bubble"></span>';
    document.body.appendChild(hopper);
    const kunti = document.createElement("button");
    kunti.className = "kunti"; kunti.title = "Klik aku";
    kunti.innerHTML = Mascots.kuntilanak({ w: 60, h: 90 }) + '<span class="bubble"></span>';
    document.body.appendChild(kunti);
    for (const el of [hopper, kunti]) {
      el.addEventListener("click", () => {
        const b = el.querySelector(".bubble");
        b.textContent = JOKES[(Math.random() * JOKES.length) | 0];
        b.classList.add("show"); Sfx.play("hihi");
        clearTimeout(el._t); el._t = setTimeout(() => b.classList.remove("show"), 3800);
      });
    }
  }

  function soundButton() {
    const b = document.createElement("button");
    b.className = "sound-btn"; b.type = "button";
    const paint = () => { b.textContent = Sfx.muted ? "🔇" : "🔊"; b.title = Sfx.muted ? "Suara mati" : "Suara nyala"; };
    b.addEventListener("click", () => { Sfx.toggle(); paint(); Sfx.play("click"); });
    paint(); document.body.appendChild(b);
  }

  window.FX = { Sfx, toast, confetti, shake, ambient, soundButton, store };
})();
