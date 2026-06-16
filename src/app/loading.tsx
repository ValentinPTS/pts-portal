import { LoadingRows } from "@/components/States";

// App-wide loading skeleton (shown while a route segment streams in).
export default function Loading() {
  return (
    <div style={{ padding: 32, width: "100%" }}>
      <div className="card" style={{ padding: 8, maxWidth: 720 }}>
        <LoadingRows rows={6} />
      </div>
    </div>
  );
}
