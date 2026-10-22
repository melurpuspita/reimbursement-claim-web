// Maskot hantu lucu (SVG). Semua digambar manual: pocong, kuntilanak, hantu polos, labu.
(function () {
  const INK = "#2b2147", LINE = "#6b5aa6", WHITE = "#fffdf7", PINK = "#ffb3d1";
  const wrap = (vb, o, inner) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${o.w || 60}" height="${o.h || 90}" class="${o.cls || ""}" aria-hidden="true">${inner}</svg>`;
  const eyes = (lx, rx, y, r = 6) =>
    `<g class="blink"><circle cx="${lx}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${rx}" cy="${y}" r="${r}" fill="${INK}"/>
     <circle cx="${lx - 2}" cy="${y - 2.5}" r="2.2" fill="#fff"/><circle cx="${rx - 2}" cy="${y - 2.5}" r="2.2" fill="#fff"/></g>`;
  const cheeks = (lx, rx, y) => `<ellipse cx="${lx}" cy="${y}" rx="5" ry="3" fill="${PINK}"/><ellipse cx="${rx}" cy="${y}" rx="5" ry="3" fill="${PINK}"/>`;
  const smile = (cx, y, w = 6) => `<path d="M${cx - w} ${y} Q${cx} ${y + 7} ${cx + w} ${y}" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;

  const pocong = (o = {}) =>
    wrap("0 0 100 150", o, `
      <ellipse cx="50" cy="144" rx="26" ry="5" fill="rgba(0,0,0,.25)"/>
      <path d="M24 130 C13 92 15 54 36 36 C43 30 57 30 64 36 C85 54 87 92 76 130 C60 140 40 140 24 130Z" fill="${WHITE}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M50 32 C40 22 35 13 39 9 C44 6 48 13 50 20 C52 13 56 6 61 9 C65 13 60 22 50 32Z" fill="${WHITE}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>
      <path d="M34 46 Q50 55 66 46" fill="none" stroke="#c9b6ff" stroke-width="5" stroke-linecap="round"/>
      <path d="M22 118 Q50 131 78 118" fill="none" stroke="#c9b6ff" stroke-width="5" stroke-linecap="round"/>
      ${eyes(40, 60, 72, 7)}${cheeks(31, 69, 85)}${smile(50, 86)}`);

  const kuntilanak = (o = {}) =>
    wrap("0 0 100 150", o, `
      <path d="M22 46 C22 12 78 12 78 46 L88 124 C72 114 67 102 67 88 L33 88 C33 102 28 114 12 124Z" fill="${INK}"/>
      <path d="M30 80 C30 70 70 70 70 80 L90 140 C70 132 62 148 50 140 C38 148 30 132 10 140Z" fill="${WHITE}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>
      <ellipse cx="50" cy="50" rx="20" ry="22" fill="#fff7ee" stroke="${LINE}" stroke-width="3"/>
      <path d="M29 46 C33 24 67 24 71 46 C63 38 55 35 50 30 C45 35 37 38 29 46Z" fill="${INK}"/>
      <path d="M29 50 C23 72 23 98 27 116" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M71 50 C77 72 77 98 73 116" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${eyes(42, 58, 54, 5.5)}${cheeks(35, 65, 64)}${smile(50, 65, 5)}
      <g transform="translate(70 28)"><circle cx="0" cy="-5" r="4.5" fill="#ff7eb6"/><circle cx="5" cy="-1" r="4.5" fill="#ff7eb6"/><circle cx="3" cy="5" r="4.5" fill="#ff7eb6"/><circle cx="-3" cy="5" r="4.5" fill="#ff7eb6"/><circle cx="-5" cy="-1" r="4.5" fill="#ff7eb6"/><circle cx="0" cy="0" r="3" fill="#ffd95e"/></g>`);

  const ghost = (o = {}) =>
    wrap("0 0 100 120", o, `
      <path d="M18 108 V54 C18 12 82 12 82 54 V108 L70 98 L58 108 L46 98 L34 108Z" fill="${o.fill || WHITE}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>
      ${eyes(39, 61, 54, 6)}${cheeks(31, 69, 67)}<ellipse cx="50" cy="70" rx="5" ry="6" fill="${INK}"/>`);

  const pumpkin = (o = {}) =>
    wrap("0 0 100 100", o, `
      <path d="M50 22 C48 12 54 8 60 6" stroke="#4caf50" stroke-width="6" fill="none" stroke-linecap="round"/>
      <ellipse cx="32" cy="58" rx="22" ry="30" fill="#ff8a2b" stroke="#b34a00" stroke-width="3"/>
      <ellipse cx="68" cy="58" rx="22" ry="30" fill="#ff8a2b" stroke="#b34a00" stroke-width="3"/>
      <ellipse cx="50" cy="58" rx="16" ry="32" fill="#ffa94d" stroke="#b34a00" stroke-width="3"/>
      <path d="M36 52 L44 58 L36 62Z M64 52 L56 58 L64 62Z" fill="${INK}"/>
      <path d="M38 74 Q50 84 62 74" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`);

  const dataUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  window.Mascots = { pocong, kuntilanak, ghost, pumpkin, dataUrl };
})();
