import { getDoc } from "../src/lib/documents.ts";
import { withFormCtx } from "../src/lib/form-fields.ts";
import { pavingBlocks } from "../src/lib/seed-paving-blocks.ts";

// Fillable form fields: the Feedback Sheet renders real inputs in fill mode and
// the saved values statically (what the PDF shows). No server/auth needed.

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };
const render = getDoc("feedback")!.render!;

// fill mode → real inputs
const fillHtml = withFormCtx({ fill: true, values: {} }, () => render(pavingBlocks, "bg"));
ok("fill: rating radio input", fillHtml.includes('name="q1"') && fillHtml.includes('class="ff-rate-in"'));
ok("fill: checkbox input q3_yes", fillHtml.includes('type="checkbox" name="q3_yes"'));
ok("fill: radio input q4", fillHtml.includes('type="radio" name="q4"'));
ok("fill: textarea q6", fillHtml.includes('<textarea class="ff-area" name="q6"'));
ok("fill: text input q3 other", fillHtml.includes('name="q3_other_text"'));

// static empty → drawn controls, no inputs
const emptyHtml = withFormCtx({ fill: false, values: {} }, () => render(pavingBlocks, "bg"));
ok("static: no form inputs", !emptyHtml.includes("<input") && !emptyHtml.includes("<textarea"));
ok("static: empty boxes present", emptyHtml.includes('class="ff-box"') || emptyHtml.includes('class="ff-rate"'));
ok("static: no checked marks when empty", !emptyHtml.includes("ff-box on") && !emptyHtml.includes("ff-rate on"));

// static with saved values → values drawn in
const filled = withFormCtx(
  { fill: false, values: { q1: "3", q3_yes: "1", q4: "yes", q6: "Concrete kerbs\nPaving slabs", q3_other_text: " direct comparison" } },
  () => render(pavingBlocks, "bg")
);
ok("filled: rating 3 marked", filled.includes("ff-rate on"));
ok("filled: checkbox q3_yes ticked", filled.includes("ff-box on") && filled.includes("✓"));
ok("filled: radio q4=yes selected", filled.includes("ff-rb on") && filled.includes("●"));
ok("filled: textarea lines show text", filled.includes("Concrete kerbs") && filled.includes("Paving slabs"));
ok("filled: text blank shows value", filled.includes("direct comparison"));
ok("filled: still no inputs (static)", !filled.includes("<input") && !filled.includes("<textarea"));

console.log(`\nform-fields.test: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
