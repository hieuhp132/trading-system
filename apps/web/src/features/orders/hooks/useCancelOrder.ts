import { useMutation, useQueryClient } from "@tanstack/react-query";

import { cancelOrder } from "../api";

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderId: string) => cancelOrder(orderId),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["orders"],
      });
    },
  });
}
