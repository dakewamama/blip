import { API_BASE } from "@/lib/api";

/**
 * Shown instead of a feed when the backend is unreachable.
 * Deliberately not a fallback to sample data — a trading screen showing stale
 * or invented prices is worse than one that admits it has nothing.
 */
export default function BackendDown({ message }: { message: string }) {
  return (
    <div className="empty">
      <p className="serif" style={{ fontSize: 30, margin: 0 }}>No live market data.</p>
      <p style={{ color: "var(--muted-2)", fontSize: 15.5, margin: "12px auto 0", maxWidth: 420, lineHeight: 1.6 }}>
        {message}
      </p>
      <p className="mono" style={{ color: "var(--muted-5)", fontSize: 13, marginTop: 18 }}>
        API: {API_BASE}
      </p>
      <p style={{ color: "var(--muted-4)", fontSize: 13.5, marginTop: 18, lineHeight: 1.6 }}>
        Start the backend with <span className="mono">npm run start:dev</span>, then reload.
      </p>
    </div>
  );
}
