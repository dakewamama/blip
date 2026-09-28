"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/** Search lives in the URL so the discover feed stays shareable and back-button friendly. */
export default function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  const commit = (next: string) => {
    setValue(next);
    const search = new URLSearchParams(params.toString());
    if (next.trim()) search.set("q", next.trim());
    else search.delete("q");
    const target = pathname.startsWith("/app/discover") ? pathname : "/app/discover";
    router.replace(`${target}?${search.toString()}`, { scroll: false });
  };

  return (
    <div style={{ flex: 1, minWidth: 200, background: "var(--surface)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 999, padding: "14px 22px", display: "flex", alignItems: "center", gap: 12 }}>
      <span aria-hidden style={{ color: "var(--muted-4)", fontSize: 14 }}>⌕</span>
      <label className="sr-only" htmlFor="app-search">Search tokens</label>
      <input id="app-search" value={value} onChange={(e) => commit(e.target.value)}
        placeholder="Search ticker or paste address"
        style={{ flex: 1, background: "none", border: "none", color: "var(--text)", fontSize: 14.5, outline: "none" }} />
    </div>
  );
}
