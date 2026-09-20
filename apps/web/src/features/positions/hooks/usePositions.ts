import { useQuery } from "@tanstack/react-query";

import { getPositions } from "../api";

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: getPositions,
    refetchInterval: 2000,
  });
}
