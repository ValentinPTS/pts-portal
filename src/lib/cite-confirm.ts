// Another scheme's number in a document about to go out (R5UA-1) is refused — unless the person says it is
// cited on purpose (an earlier round), each number named (round 6, R6UP-5). The question, in one place.
export function citeQuestion(numbers: readonly string[], lang: "bg" | "en"): string {
  const list = numbers.join(", ");
  return lang === "bg"
    ? `Документът съдържа номера на друга схема: ${list}.\n\nАко е копиран от нея или започнат от неин шаблон — натиснете «Отказ» и поправете номера.\nАко го цитирате нарочно (напр. предходен кръг) — натиснете «OK», за да го изпратите въпреки това. Потвърждението се записва в дневника.`
    : `The document contains another scheme's number: ${list}.\n\nIf it was copied from it or started from its template — press «Cancel» and correct the number.\nIf you cite it on purpose (an earlier round, say) — press «OK» to send it anyway. The confirmation is journalled.`;
}
