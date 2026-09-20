import { api } from "../../lib/api";
import type { ApiResponse, LoginInput, LoginResponse } from "../../types/api";

export async function login(input: LoginInput): Promise<LoginResponse> {
  const response = await api.post<ApiResponse<LoginResponse>>(
    "/auth/login",
    input,
  );

  return response.data.data;
}
