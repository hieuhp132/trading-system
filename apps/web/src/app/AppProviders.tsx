import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { MarketStreamBridge } from "../features/market/MarketStreamBridge";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MarketStreamBridge>
        {children}
      </MarketStreamBridge>
    </QueryClientProvider>
  );
}
