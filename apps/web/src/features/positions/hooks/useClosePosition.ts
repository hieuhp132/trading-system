import { useMutation, useQueryClient } from "@tanstack/react-query";

import { closePosition } from "../api";
import type { ClosePositionInput } from "../api";

export function useClosePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ClosePositionInput) => closePosition(input),

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["positions"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["account", "balance"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["orders"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["portfolio"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["trades"],
        }),
      ]);
    },
  });
}
