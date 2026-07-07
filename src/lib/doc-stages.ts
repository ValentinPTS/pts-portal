// The 14 documents grouped by the real scheme lifecycle (see PROJECT-ANATOMY.md).
// Grouping the documents view by stage makes it scannable and makes the order carry
// meaning, instead of one flat wall of identical tiles.
export interface DocStage {
  key: string;   // "1".."5" — shown as the stage index
  bg: string;
  en: string;
  docs: string[]; // document keys (must match lib/documents.ts DOCUMENTS keys)
}

export const DOC_STAGES: DocStage[] = [
  { key: "1", bg: "Подготовка", en: "Setup", docs: ["order", "plan", "stat-project"] },
  { key: "2", bg: "Покана и заявки", en: "Invitation & applications", docs: ["invitation", "application", "registered", "registered-coded"] },
  { key: "3", bg: "Изпращане на пробите", en: "Dispatch", docs: ["declaration", "protocol", "instruction", "results"] },
  { key: "4", bg: "Оценка и издаване", en: "Evaluation & issuing", docs: ["report", "certificate"] },
  { key: "5", bg: "Обратна връзка", en: "Feedback", docs: ["feedback"] },
];

// Every document key that has a stage (the 14 slots). Used to validate upload targets.
export const ALL_DOC_KEYS: string[] = DOC_STAGES.flatMap((s) => s.docs);
export const isDocKey = (k: string): boolean => ALL_DOC_KEYS.includes(k);
