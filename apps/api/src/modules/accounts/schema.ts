import { z } from "zod";

export const createDemoAccountSchema = z.object({});

export type CreateDemoAccountInput = z.infer<typeof createDemoAccountSchema>;
