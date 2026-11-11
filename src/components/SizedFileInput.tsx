"use client";

import { useState } from "react";

// A file input that refuses, before sending, a file larger than the portal takes — a body over the
// server's limit broke the request with the framework's own words («Unexpected end of form», a 500;
// the security sweep, round 2, R2U-3). The server's own checks stay.
export default function SizedFileInput({ name, accept, maxBytes, lang, style, required = true }: { name: string; accept: string; maxBytes: number; lang: "bg" | "en"; style?: React.CSSProperties; required?: boolean }) {
  const [problem, setProblem] = useState<string | null>(null);
  const mb = Math.round(maxBytes / 1_000_000);
  return (
    <>
      <input type="file" name={name} required={required} accept={accept} style={style} data-sized-file={maxBytes}
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          const say = f && f.size > maxBytes ? (lang === "bg" ? `Файлът е по-голям от ${mb} MB — изберете по-малък.` : `The file is larger than ${mb} MB — choose a smaller one.`) : null;
          e.currentTarget.setCustomValidity(say ?? "");
          setProblem(say);
        }} />
      {problem && <span role="alert" data-file-too-large style={{ fontSize: 12, color: "#8f2f2f" }}>{problem}</span>}
    </>
  );
}
