import { api, ApiError } from "@/lib/api";
import BackendDown from "@/components/BackendDown";
import TokenDetail from "./TokenDetail";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  try {
    const { token } = await api.token(mint);
    return { title: `blip \u2014 ${token.name} (${token.symbol})` };
  } catch {
    return { title: "blip" };
  }
}

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;

  try {
    // Token and history in parallel — history is a separate upstream and is
    // allowed to fail without taking the page down.
    const [detail, history] = await Promise.all([
      api.token(mint),
      api.history(mint, "minute", 60).catch(() => ({ points: [], source: "unavailable" as const, poolId: null })),
    ]);

    return <TokenDetail token={detail.token} safety={detail.safety} history={history} />;
  } catch (error) {
    return (
      <BackendDown
        message={
          error instanceof ApiError && error.status === 404
            ? "No pump.fun token exists for that mint."
            : error instanceof ApiError
              ? error.message
              : "Could not reach the market data service."
        }
      />
    );
  }
}
