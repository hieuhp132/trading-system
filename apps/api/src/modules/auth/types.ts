export type AuthUser = {
  id: string;
  email: string;
  fullname: string | null;
  role: "USER" | "ADMIN";
};

export type AuthResponse = {
  user: AuthUser;
  accessToken: string;
};
