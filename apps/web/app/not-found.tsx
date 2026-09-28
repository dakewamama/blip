import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, textAlign: "center" }}>
      <div>
        <p className="serif" style={{ fontSize: 46, margin: 0 }}>That page doesn&apos;t exist.</p>
        <p style={{ color: "var(--muted-2)", fontSize: 16, margin: "14px 0 0" }}>
          The token may have been delisted, or the link is stale.
        </p>
        <Link href="/app/discover" className="btn btn-primary" style={{ marginTop: 28, display: "inline-block" }}>
          Back to discover
        </Link>
      </div>
    </div>
  );
}
