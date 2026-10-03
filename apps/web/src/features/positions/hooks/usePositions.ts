import { useQuery } from "@tanstack/react-query";

import { getPositions } from "../api";
import { isMarketClosedApiError } from "../../market/market-hours";

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      try {
        return await getPositions();
      } catch (error) {
        if (isMarketClosedApiError(error)) {
          return [];
        }
        throw error;
      }
    },
    refetchInterval: 2000,
  });
}
