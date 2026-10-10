import { z } from 'zod';
export const nameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);
export const createDatabaseSchema = z
  .object({
    name: nameSchema,
    group: nameSchema.default('default'),
    seed: z
      .object({ type: z.literal('database'), name: nameSchema })
      .strict()
      .optional(),
  })
  .strict();
export const createGroupSchema = z
  .object({ name: nameSchema, location: z.literal('local') })
  .strict();
export const databaseConfigSchema = z
  .object({
    block_reads: z.boolean().optional(),
    block_writes: z.boolean().optional(),
    delete_protection: z.boolean().optional(),
  })
  .strict();
export const groupConfigSchema = z.object({ delete_protection: z.boolean() }).strict();
export const tokenQuerySchema = z
  .object({
    expiration: z.string().default('never'),
    authorization: z.enum(['full-access', 'read-only']).default('full-access'),
  })
  .strict();
export type DatabaseDto = {
  Name: string;
  DbId: string;
  Hostname: string;
  group: string;
  primaryRegion: string;
  regions: string[];
  block_reads: boolean;
  block_writes: boolean;
  delete_protection: boolean;
  parent: { id: string; name: string; branched_at: string } | null;
};
export type GroupDto = {
  name: string;
  uuid: string;
  primary: string;
  locations: string[];
  delete_protection: boolean;
};
