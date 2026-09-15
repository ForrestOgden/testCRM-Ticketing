"use client";

import Link from "next/link";
import { useApiResource } from "../hooks/useApiResource";

type SearchResult = { type: "client" | "contact" | "device" | "ticket"; id: string; title: string; subtitle?: string | null; href: string };

function target(item: SearchResult) {
  if (item.type === "ticket") return `/tickets?id=${item.id}`;
  if (item.type === "device") return `/devices?id=${item.id}`;
  if (item.type === "contact") return "/contacts";
  return item.href;
}

function label(type: SearchResult["type"]) {
  return type[0].toUpperCase() + type.slice(1);
}

export function SearchResults({ query }: { query: string }) {
  const enabled = query.trim().length >= 2;
  const resource = useApiResource<SearchResult[]>(enabled ? `/search?q=${encodeURIComponent(query.trim())}` : "/search?q=__", enabled);

  if (!enabled) return <div className="emptyPanel">Enter at least two characters to search across the CRM.</div>;
  if (resource.loading && !resource.data) return <div className="loadingPanel">Searching…</div>;
  if (resource.error && !resource.data) return <div className="errorPanel">Search failed. {resource.error}</div>;

  const results = resource.data ?? [];
  const groups = (["client", "contact", "device", "ticket"] as const).map((type) => ({ type, items: results.filter((item) => item.type === type) })).filter((group) => group.items.length);

  if (!groups.length) return <div className="emptyPanel">No results found for “{query}”.</div>;

  return <div className="searchResults">{groups.map((group) => <section className="searchGroup" key={group.type}><h2>{label(group.type)}s</h2>{group.items.map((item) => <Link href={target(item)} className="searchResult" key={`${item.type}-${item.id}`}><div><strong>{item.title}</strong><span style={{ display: "block", marginTop: 4 }}>{item.subtitle || label(item.type)}</span></div><span>Open →</span></Link>)}</section>)}</div>;
}
