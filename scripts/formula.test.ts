import { formulaToMathML, PT_FORMULAS } from "../src/lib/formula.ts";

// The editor's formula engine (linear syntax → MathML). Pure — no DOM.

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

// basics
{
  const m = formulaToMathML("x + 1");
  ok("simple sum parses", !!m && m.includes("<mi>x</mi>") && m.includes("<mo>+</mo>") && m.includes("<mn>1</mn>"));
  ok("wrapped in <math>", !!m && m.startsWith("<math") && m.endsWith("</math>"));
}

// fraction drops parens around its operands (like Word)
{
  const m = formulaToMathML("(a − b) / c");
  ok("fraction built", !!m && m.includes("<mfrac>"));
  ok("fraction numerator loses parens", !!m && !m.includes("<mo>(</mo>"));
  const keep = formulaToMathML("(a + b) · c");
  ok("non-fraction parens kept", !!keep && keep.includes("<mo>(</mo>"));
}

// sub/sup/subsup
{
  ok("subscript", formulaToMathML("x_i")!.includes("<msub><mi>x</mi><mi>i</mi></msub>"));
  ok("superscript", formulaToMathML("x^2")!.includes("<msup><mi>x</mi><mn>2</mn></msup>"));
  ok("subsup combines", formulaToMathML("u_i^2")!.includes("<msubsup><mi>u</mi><mi>i</mi><mn>2</mn></msubsup>"));
  ok("sup then sub also combines", formulaToMathML("u^2_i")!.includes("<msubsup>"));
}

// sqrt
{
  const m = formulaToMathML("sqrt(a^2 + b^2)");
  ok("sqrt parses", !!m && m.includes("<msqrt>"));
  ok("sqrt keeps content", !!m && m.includes("<msup><mi>a</mi><mn>2</mn></msup>"));
}

// multiplication forms + s* identifier + hyphen→minus
{
  ok("· multiplies", formulaToMathML("1.25 · s* / sqrt(p)")!.includes("<mi>s*</mi>"));
  ok("bare * multiplies", formulaToMathML("k * u")!.includes("<mo>·</mo>"));
  ok("hyphen becomes minus", formulaToMathML("a - b")!.includes("<mo>−</mo>"));
  ok("unary minus", formulaToMathML("−x + 1") !== null);
}

// escaping — no raw < > & can survive from input
{
  ok("bad chars rejected", formulaToMathML("a & b") === null);
  ok("relations escaped", formulaToMathML("a < b")!.includes("<mo>&lt;</mo>"));
}

// errors → null, never garbage
{
  ok("unclosed paren → null", formulaToMathML("(a + b") === null);
  ok("empty → null", formulaToMathML("   ") === null);
  ok("trailing op → null", formulaToMathML("a +") === null);
  ok("unknown char → null", formulaToMathML("a @ b") === null);
}

// every prebuilt PT formula parses
for (const f of PT_FORMULAS) {
  ok(`prebuilt parses: ${f.id}`, formulaToMathML(f.src) !== null);
}
ok("z formula has the fraction", formulaToMathML(PT_FORMULAS[0].src)!.includes("<mfrac>"));
ok("ζ formula has sqrt + subsup", (() => { const m = formulaToMathML(PT_FORMULAS[1].src)!; return m.includes("<msqrt>") && m.includes("<msubsup>"); })());

console.log(`formula.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
