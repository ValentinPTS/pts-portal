// The link rule (round 9, T1), measured in the page — real Chromium layout and hit testing. Used by
// scripts/verify-doc-links.mjs (copied from the round 9 rule test, links/lib/check.mjs).
//
//   A  a link's clickable area never reaches beyond its own text: a sample point where
//      elementFromPoint gives a link (or something inside it) but which lies more than TOL px
//      outside the link's own text rectangles (a Range over its text nodes) and its pictures'
//      boxes (img, svg, canvas, video, form controls, SVG shapes) is a violation.
//   B  nothing of the document body covers what is outside the body's own box: a sample point
//      more than TOL px outside the body's box whose topmost hit is inside the body.
//      Split by where the point is: «sheet» = inside the A4 sheet (.page / .we-page) but outside
//      the body (covers the document's own cover/head/footer), «out» = outside the sheet (the
//      viewport around the document; in the editor: its toolbar, buttons, panel).
//   C  (extra) one link takes a large share of the screen's clicks (≥ C_SHARE of the samples) —
//      catches an invisible or blown-up link whose «own» area is itself huge (a 1×1 px picture
//      stretched, an SVG rect with fill-opacity 0, a 3000px font in transparent colour).
//
// Sampling: a grid over the viewport (STEP px) plus rings around every link's own rectangles
// and around the body's box, so a small overreach is caught as well as a whole-screen one.

export const TOL = 4;

/** Runs in the page. cfg: { bodySel, sheetSel, step, cShare } → findings (plain JSON). */
export function pageCheck(cfg) {
  const TOL = cfg.tol ?? 4;
  const XLINK = "http://www.w3.org/1999/xlink";
  const body = document.querySelector(cfg.bodySel);
  if (!body) return { error: "no body " + cfg.bodySel };
  const sheet = document.querySelector(cfg.sheetSel) || document.documentElement;
  const vw = window.innerWidth, vh = window.innerHeight;
  const B = body.getBoundingClientRect(), S = sheet.getBoundingClientRect();
  const isLink = (el) => {
    const n = el.localName;
    if (n === "a") return el.hasAttribute("href") || el.hasAttributeNS(XLINK, "href");
    if (n === "area") return el.hasAttribute("href");
    return false;
  };
  const linkOf = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement || (e.parentNode && e.parentNode.host) || null) { if (isLink(e)) return e; } return null; };
  const links = [...body.querySelectorAll("a, area")].filter(isLink);
  // the own area of each link
  // own = what the reader SEES of the link: its text (not transparent, not faded out), its pictures (not a
  // 1–2 px picture blown up), its form controls, and the SVG shapes it paints (fill or stroke not invisible)
  const OWN_BOX = "img,canvas,video,input,select,textarea,button,meter,progress,image,rect,circle,ellipse,line,polyline,polygon,path,use,text"; // an <svg> counts by what it draws, never by its box
  const SVG_SHAPE = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "use", "text"]);
  const alpha = (c) => { const m = /rgba?\(([^)]*)\)/.exec(c || ""); if (!m) return c === "transparent" ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length >= 4 ? parseFloat(p[3]) * (p[3].endsWith("%") ? 0.01 : 1) : 1; };
  const faded = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); o *= parseFloat(cs.opacity); if (cs.visibility !== "visible" && e === el) return true; if (/opacity\(0(\.0*)?\)|opacity\(0%\)/.test(cs.filter)) return true; } return o < 0.05; };
  const visibleText = (t) => { const p = t.parentElement; if (!p) return false; const cs = getComputedStyle(p); if (alpha(cs.color) < 0.05 && (!cs.webkitTextStrokeWidth || parseFloat(cs.webkitTextStrokeWidth) === 0)) return false; if (parseFloat(cs.fontSize) === 0) return false; return !faded(p); };
  const visibleBox = (el) => {
    if (faded(el)) return false;
    if (SVG_SHAPE.has(el.localName) && el.namespaceURI === "http://www.w3.org/2000/svg") {
      const cs = getComputedStyle(el);
      const fillOn = cs.fill !== "none" && alpha(cs.fill) > 0.05 && parseFloat(cs.fillOpacity) > 0.05;
      const strokeOn = cs.stroke !== "none" && alpha(cs.stroke) > 0.05 && parseFloat(cs.strokeOpacity) > 0.05 && parseFloat(cs.strokeWidth) > 0;
      return fillOn || strokeOn;
    }
    if (el.localName === "img" && el.complete && el.naturalWidth > 0 && el.naturalWidth * el.naturalHeight <= 4) {
      const r = el.getBoundingClientRect(); return r.width * r.height <= 64; // a 1×1 picture stretched is no picture
    }
    return true;
  };
  const range = document.createRange();
  const ownOf = new Map();
  const imgForMap = (area) => {
    const map = area.closest("map"); if (!map) return [];
    const name = map.getAttribute("name") || map.id; if (!name) return [];
    return [...document.querySelectorAll("img[usemap]")].filter((i) => i.getAttribute("usemap") === "#" + name);
  };
  for (const L of links) {
    const rects = [];
    const add = (r) => { if (r.width > 0 && r.height > 0) rects.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); };
    if (L.localName === "area") { for (const img of imgForMap(L)) if (visibleBox(img)) add(img.getBoundingClientRect()); }
    else {
      const tw = document.createTreeWalker(L, NodeFilter.SHOW_TEXT);
      for (let t; (t = tw.nextNode());) {
        if (!/[^\s\u200b\u00a0]/.test(t.data)) continue;
        if (!visibleText(t)) continue;
        // its ink: each run of non-blank characters (a run of no-break spaces is no text a reader sees)
        let k = 0;
        for (const m of t.data.matchAll(/[^\s\u200b\u00a0]+/g)) {
          if (++k > 300) { range.selectNodeContents(t); for (const r of range.getClientRects()) add(r); break; }
          range.setStart(t, m.index); range.setEnd(t, m.index + m[0].length);
          for (const r of range.getClientRects()) add(r);
        }
      }
      for (const el of L.querySelectorAll(OWN_BOX)) if (visibleBox(el)) add(el.getBoundingClientRect());
    }
    ownOf.set(L, rects);
  }
  const inRects = (rects, x, y, pad) => rects.some((r) => x >= r.l - pad && x <= r.r + pad && y >= r.t - pad && y <= r.b + pad);
  // sample points
  const pts = [];
  const step = cfg.step ?? 16;
  for (let y = step / 2; y < vh; y += step) for (let x = step / 2; x < vw; x += step) pts.push([x, y, 1]);
  const ring = (r, d) => {
    const xs = [r.l - d, (r.l + r.r) / 2, r.r + d], ys = [r.t - d, (r.t + r.b) / 2, r.b + d];
    for (const x of xs) for (const y of ys) pts.push([x, y, 0]);
  };
  for (const rs of ownOf.values()) for (const r of rs.slice(0, 40)) { ring(r, TOL + 3); ring(r, 24); }
  const br = { l: B.left, t: B.top, r: B.right, b: B.bottom };
  ring(br, TOL + 3); ring(br, 30);
  const grid = pts.filter((p) => p[2]).length;
  // hits
  const A = new Map(), Bf = { sheet: 0, out: 0, link: 0, samples: [], chrome: {} }, C = new Map();
  const outsideBody = (x, y) => x < B.left - TOL || x > B.right + TOL || y < B.top - TOL || y > B.bottom + TOL;
  const outsideSheet = (x, y) => x < S.left - TOL || x > S.right + TOL || y < S.top - TOL || y > S.bottom + TOL;
  const chromeUnder = (x, y) => {
    for (const e of document.elementsFromPoint(x, y)) { if (body.contains(e)) continue; const c = e.closest && e.closest("[data-chrome]"); if (c) return c.getAttribute("data-chrome"); }
    return null;
  };
  const desc = (el) => { if (!el) return null; let s = el.localName; if (el.id) s += "#" + el.id; if (el.classList && el.classList.length) s += "." + [...el.classList].slice(0, 3).join("."); return s; };
  for (const [x, y, isGrid] of pts) {
    if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
    const hit = document.elementFromPoint(x, y);
    if (!hit || !body.contains(hit)) continue;
    const L = linkOf(hit);
    if (L && body.contains(L)) {
      if (isGrid) C.set(L, (C.get(L) ?? 0) + 1);
      if (!inRects(ownOf.get(L) ?? [], x, y, TOL)) {
        let a = A.get(L);
        if (!a) { a = { n: 0, grid: 0, maxDist: 0, sample: null, hit: desc(hit), bbox: [x, y, x, y] }; A.set(L, a); }
        a.n++; if (isGrid) a.grid++;
        const own = ownOf.get(L) ?? [];
        let dmin = Infinity;
        for (const r of own) { const dx = Math.max(r.l - x, 0, x - r.r), dy = Math.max(r.t - y, 0, y - r.b); dmin = Math.min(dmin, Math.hypot(dx, dy)); }
        if (!own.length) dmin = 9999;
        if (dmin > a.maxDist) { a.maxDist = Math.round(dmin); a.sample = [Math.round(x), Math.round(y)]; }
        a.bbox = [Math.min(a.bbox[0], x), Math.min(a.bbox[1], y), Math.max(a.bbox[2], x), Math.max(a.bbox[3], y)];
      }
    }
    if (outsideBody(x, y)) {
      const where = outsideSheet(x, y) ? "out" : "sheet";
      Bf[where]++;
      if (L) Bf.link++;
      if (cfg.chrome && where === "out" && (Bf.out % 3 === 1)) { const c = chromeUnder(x, y); if (c) Bf.chrome[c] = (Bf.chrome[c] ?? 0) + 1; }
      if (Bf.samples.length < 6) Bf.samples.push({ x: Math.round(x), y: Math.round(y), where, hit: desc(hit), link: !!L, chrome: cfg.chrome ? chromeUnder(x, y) : undefined });
    }
  }
  const linkDesc = (L) => ({ tag: L.localName, ns: L.namespaceURI === "http://www.w3.org/2000/svg" ? "svg" : L.namespaceURI === "http://www.w3.org/1998/Math/MathML" ? "math" : "html", href: (L.getAttribute("href") || L.getAttributeNS(XLINK, "href") || "").slice(0, 60), text: (L.textContent || "").trim().slice(0, 30) });
  const out = { vw, vh, grid, body: [B.left, B.top, B.width, B.height].map(Math.round), sheet: [S.left, S.top, S.width, S.height].map(Math.round), links: links.length, A: [], B: null, C: [] };
  for (const [L, a] of A) if (a.maxDist > TOL) out.A.push({ ...linkDesc(L), n: a.n, gridShare: +(a.grid / grid).toFixed(4), maxDist: a.maxDist, sample: a.sample, hit: a.hit, reach: a.bbox.map(Math.round) });
  if (Bf.sheet + Bf.out) out.B = Bf;
  for (const [L, n] of C) if (n / grid >= (cfg.cShare ?? 0.15)) out.C.push({ ...linkDesc(L), gridShare: +(n / grid).toFixed(3) });
  return out;
}
