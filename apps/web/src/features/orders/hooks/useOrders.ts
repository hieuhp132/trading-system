import { useQuery } from "@tanstack/react-query";

import { getOrders } from "../api";

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: getOrders,
    refetchInterval: 5000,
  });
}
