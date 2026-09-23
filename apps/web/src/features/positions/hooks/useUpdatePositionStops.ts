import { useMutation, useQueryClient } from "@tanstack/react-query";

import { updatePositionStops } from "../api";
import type { UpdatePositionStopsInput } from "../api";

export function useUpdatePositionStops() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdatePositionStopsInput) =>
      updatePositionStops(input),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["positions"],
      });
    },
  });
}
