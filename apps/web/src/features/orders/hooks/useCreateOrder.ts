import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createOrder, type CreateOrderInput } from "../api";

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOrderInput) => createOrder(input),

    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["account"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["account", "balance"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["positions"],
        }),

        queryClient.invalidateQueries({
          queryKey: ["orders"],
        }),
      ]);
    },
  });
}
