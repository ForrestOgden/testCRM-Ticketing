import { SearchResults } from "../../components/SearchResults";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return (
    <div className="pageStack">
      <section className="pageHeading compactHeading"><div><div className="eyebrow">Global search</div><h1>{q ? `Results for “${q}”` : "Search"}</h1><p>Search clients, contacts, endpoints, ticket subjects, ticket descriptions, and conversation text.</p></div></section>
      <SearchResults query={q} />
    </div>
  );
}
