import { api, ApiError, type FeedFilter, type FeedResult } from "@/lib/api";
import Discover from "./Discover";

export const metadata = { title: "blip \u2014 discover" };
export const dynamic = "force-dynamic";

const FILTERS: FeedFilter[] = ["trending", "new", "gainers", "safest"];

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { filter: rawFilter, q } = await searchParams;
  const filter: FeedFilter = FILTERS.includes(rawFilter as FeedFilter)
    ? (rawFilter as FeedFilter)
    : "trending";

  // The feed failing must not take the dashboard down with it — the page still
  // renders its full structure and the error lands inline where the list goes.
  let result: FeedResult | null = null;
  let error: string | null = null;
  try {
    // Fetched on the server so the first paint already has real market data.
    result = q?.trim() ? await api.search(q.trim()) : await api.feed(filter, 25);
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Could not reach the market data service.";
  }

  return <Discover result={result} error={error} filter={filter} query={q ?? ""} />;
}
