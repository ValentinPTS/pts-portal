// The calibration Results Sheet draws its tables without load directions (plan
// part 0.12, E3.a / N18). A mass, temperature or humidity scheme has points but no
// directions; it gets ONE table, and its fields line up with the scoring metrics
// ("0:<point>") exactly as a force scheme's do ("<direction>:<point>").
import { getDoc } from "../src/lib/documents.ts";
import { SAMPLE_SCHEMES } from "../src/lib/sample-schemes.ts";
import { forceCalibration } from "../src/lib/seed-force.ts";
import { metricsForScheme } from "../src/lib/scoring.ts";
import { calibrationDataSlots } from "../src/lib/param-remap.ts";
import { blankScheme } from "../src/lib/new-scheme.ts";
import type { Scheme, Lang } from "../src/lib/types.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else { fail++; console.error("FAIL:", name, extra); } };

const render = (s: Scheme, lang: Lang) => getDoc("results")!.render!(s, lang, { revealNames: false, participants: [] });
const count = (h: string, re: RegExp) => (h.match(re) ?? []).length;

const weights: Scheme = structuredClone(SAMPLE_SCHEMES["weights-m1"]);
const force: Scheme = structuredClone(forceCalibration);
t("fixture: weights has points and no directions", weights.calibration!.points.length === 5 && weights.calibration!.directionsEn.length === 0);
t("fixture: force has two directions", force.calibration!.directionsEn.length === 2);

for (const lang of ["bg", "en"] as const) {
  const bg = lang === "bg";

  // no directions → one table, one row per point
  const w = render(weights, lang);
  t(`${lang}: weights — one table`, count(w, /<table class="rtable">/g) === 1);
  t(`${lang}: weights — five rows, fields result_0_0 … result_0_4`,
    [0, 1, 2, 3, 4].every((j) => w.includes(`data-ff="t:result_0_${j}"`) && w.includes(`data-ff="t:unc_0_${j}"`)) && !w.includes("result_1_"));
  t(`${lang}: weights — caption names the quantity`, w.includes(bg ? "Таблица 1 — Маса" : "Table 1 — Mass"));
  t(`${lang}: weights — the unit in the headers`, w.includes(bg ? "Точка на калибриране (g)" : "Calibration point (g)"));
  t(`${lang}: weights — nothing about force or load directions`,
    !/сила|force|ISO 376|натоварва|посока на натоварване|load direction/i.test(w));
  t(`${lang}: weights — the scheme's own method, its name only`, w.includes("(OIML R 111 / EURAMET cg-18).") && !w.includes("cg-18 —"));
  t(`${lang}: weights — the reminder without directions`, w.includes(bg
    ? "за всяка точка на калибриране, за която сте заявили участие"
    : "for every calibration point for which you registered"));
  t(`${lang}: weights — no «not set yet» note`, !w.includes(bg ? "още не са зададени" : "not set for this scheme yet"));

  // with directions → one table per direction, as before
  const f = render(force, lang);
  t(`${lang}: force — two tables`, count(f, /<table class="rtable">/g) === 2);
  t(`${lang}: force — fields for both directions`, f.includes('data-ff="t:result_0_0"') && f.includes('data-ff="t:result_1_0"'));
  t(`${lang}: force — captions name quantity and direction`, bg
    ? f.includes("Таблица 1 — Сила, опън") && f.includes("Таблица 2 — Сила, натиск")
    : f.includes("Table 1 — Force, tension") && f.includes("Table 2 — Force, compression"));
  t(`${lang}: force — the unit in the headers, U fields too`,
    f.includes(bg ? "Точка на калибриране (kN)" : "Calibration point (kN)") && f.includes('data-ff="t:unc_1_0"'));
  t(`${lang}: force — the load-direction reminder stays`, f.includes(bg ? "посока на натоварване" : "load direction"));
  t(`${lang}: force — the method's name in the reminder, «(ISO 376)»`, f.includes("(ISO 376).") && !f.includes("(ISO 376 —"));

  // every scoring metric has its two fields on the sheet, and nothing more
  for (const [name, s, h] of [["weights", weights, w], ["force", force, f]] as const) {
    const keys = metricsForScheme(s).map((m) => m.key.replace(":", "_"));
    const fields = [...h.matchAll(/data-ff="t:result_(\d+_\d+)"/g)].map((m) => m[1]);
    t(`${lang}: ${name} — sheet fields = scoring metrics`, keys.length > 0 && keys.join() === fields.join(), `${keys} vs ${fields}`);
    // …and the edit guard reads each filled field as that same slot
    const filled = Object.fromEntries(fields.map((f) => [`result_${f}`, "5"]));
    const slots = calibrationDataSlots(undefined, filled).map(([d, p]) => `${d}_${p}`).sort();
    t(`${lang}: ${name} — the edit guard sees the same slots`, slots.join() === [...keys].sort().join());
  }

  // no points → the hint, no table; an empty unit leaves no "()"
  const blank: Scheme = structuredClone(weights);
  blank.calibration = { ...blank.calibration!, points: [], unit: "" };
  const b = render(blank, lang);
  t(`${lang}: no points — the hint, no table`, !b.includes('<table class="rtable">') && b.includes(bg ? "Точките на калибриране още не са зададени" : "The calibration points are not set"));
  const noUnit: Scheme = structuredClone(weights);
  noUnit.calibration = { ...noUnit.calibration!, unit: "" };
  const u = render(noUnit, lang);
  t(`${lang}: no unit — no empty brackets`, !(u.match(/<th>[^<]*<\/th>/g) ?? []).some((th) => th.includes("()")) && u.includes(bg ? "Точка на калибриране</th>" : "Calibration point</th>"));

  // a blank quantity leaves no dangling dash; a missing Bulgarian direction falls back
  const bare: Scheme = structuredClone(weights);
  bare.calibration = { ...bare.calibration!, quantityEn: "", quantityBg: "", directionsEn: ["Up"], directionsBg: [] };
  const r = render(bare, lang);
  t(`${lang}: blank quantity, BG direction missing — «Table 1 — up»`, r.includes(bg ? "Таблица 1 — up</div>" : "Table 1 — up</div>"));
  const none: Scheme = structuredClone(weights);
  none.calibration = { ...none.calibration!, quantityEn: "", quantityBg: "" };
  t(`${lang}: no quantity, no direction — «Table 1» alone`, render(none, lang).includes(bg ? "Таблица 1</div>" : "Table 1</div>"));
  // an acronym keeps its case
  const ph: Scheme = structuredClone(weights);
  ph.calibration = { ...ph.calibration!, directionsEn: ["UP"], directionsBg: ["UP"] };
  t(`${lang}: a direction in capitals keeps them`, render(ph, lang).includes(", UP</div>"));

  // everything from the scheme is escaped exactly once
  const odd: Scheme = structuredClone(weights);
  odd.calibration = { ...odd.calibration!, methodEn: "A&B <x>", methodBg: "A&B <x>", quantityEn: 'Q"<', quantityBg: 'Q"<', unit: "&", directionsEn: ["<d>"], directionsBg: ["<d>"] };
  const o = render(odd, lang);
  t(`${lang}: escaped once — method, quantity, unit, direction`,
    o.includes("(A&amp;B &lt;x&gt;).") && o.includes("Q&quot;&lt;, &lt;d&gt;") && o.includes("(&amp;)</th>")
    && !o.includes("&amp;amp;") && !o.includes("<x>") && !o.includes("<d>"));

  // a new calibration scheme brings no force method along
  const fresh = blankScheme({ id: "26-11-C-9", number: "PTS 26/11-C-9", type: "C", titleEn: "Hygrometer", titleBg: "Хигрометър",
    objectEn: "", objectBg: "", distribution: "sequential", minParticipants: 1 });
  fresh.calibration = { ...fresh.calibration!, points: ["10"] };
  const n = render(fresh, lang);
  t(`${lang}: new scheme — no ISO 376 default`, fresh.calibration.methodEn === "" && !n.includes("ISO 376"));
  t(`${lang}: new scheme — the reminder ends without empty brackets`, n.includes(bg ? "собствената си методика.</span>" : "your own procedure.</span>"));
}

console.log(`results-c.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
