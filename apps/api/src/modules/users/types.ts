export type PublicUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "USER" | "ADMIN";
  createdAt: string;
  updatedAt: string;
};
