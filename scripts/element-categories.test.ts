import { DEFAULT_CAT, categoryLabel, cmpCategory, groupByCategory } from "../src/lib/element-categories.ts";

// Shared element-category labels + ordering (the /items page and the editor panel).

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error("✗ " + n); } };

// bilingual labels for the known set; custom names pass through as typed
ok("General → Общи (bg)", categoryLabel("General", "bg") === "Общи");
ok("Results → Лист с резултати (bg)", categoryLabel("Results", "bg") === "Лист с резултати");
ok("Report → Report (en)", categoryLabel("Report", "en") === "Report");
ok("My items → Мои елементи (bg)", categoryLabel(DEFAULT_CAT, "bg") === "Мои елементи");
ok("custom category passes through", categoryLabel("Сертификати", "en") === "Сертификати");

// ordering: My items first, then document flow, custom names last A→Z
const sorted = ["Report", "Куче", "General", DEFAULT_CAT, "Results", "Апарати", "Plan", "Application", "Form"].sort(cmpCategory);
ok("document-flow order", JSON.stringify(sorted) === JSON.stringify([DEFAULT_CAT, "General", "Form", "Plan", "Application", "Results", "Report", "Апарати", "Куче"]));

// grouping: groups ordered, items alphabetical inside, default bucket applied
const items = [
  { c: "Report", n: "z criterion" },
  { c: undefined, n: "own note" },
  { c: "Report", n: "assigned value" },
  { c: "General", n: "confidentiality" },
];
const groups = groupByCategory(items, (i) => i.c, (i) => i.n);
ok("group order My items → General → Report", JSON.stringify(groups.map((g) => g[0])) === JSON.stringify([DEFAULT_CAT, "General", "Report"]));
ok("items alphabetical within group", groups[2][1].map((i) => i.n).join("|") === "assigned value|z criterion");
ok("undefined category lands in My items", groups[0][1][0].n === "own note");

console.log(`element-categories.test: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
