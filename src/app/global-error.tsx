"use client"; // error boundaries must be client components

// The last net (part 1.1): an error in the ROOT layout itself, which app/error.tsx
// cannot catch. It replaces the layout, so it brings its own <html>/<body> and no
// language provider — both languages, plainly. Next 16: the retry is unstable_retry.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="bg">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f8f5", color: "#1f2a1f" }}>
        <div style={{ maxWidth: 560, margin: "80px auto", padding: 24, background: "#fff", border: "1px solid #dfe6dc", borderRadius: 10 }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px", color: "#8f2f2f" }}>Порталът не успя да зареди страницата</h1>
          <p style={{ margin: "0 0 4px" }}>The portal could not load this page.</p>
          <p style={{ margin: "12px 0", fontSize: 14, color: "#5d6b5d" }}>
            Опитайте отново след малко. Ако се повтаря, кажете на PTS. · Try again in a moment; if it keeps happening, tell PTS.
            {error?.digest ? <><br /><span style={{ fontFamily: "monospace" }}>ref: {error.digest}</span></> : null}
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #456b2c", background: "#456b2c", color: "#fff", cursor: "pointer" }}
          >
            Опитай отново · Try again
          </button>
        </div>
      </body>
    </html>
  );
}
