import { z } from 'zod'

export const idSchema = z.number().int().positive()
export const nullableText = z.string().trim().min(1).max(2000).nullable()
export const textSchema = z.string().trim().min(1).max(2000)

export const urlSchema = z
  .string()
  .trim()
  .url()
  .max(4000)
  .refine((v) => /^https?:\/\//i.test(v), 'Only http(s) URLs are supported')

export const playlistCreateSchema = z.object({
  name: textSchema,
  sourceType: z.enum(['url', 'file', 'manual']),
  sourceUrl: z.string().trim().max(4000).nullable().optional(),
  sourcePath: z.string().trim().max(4000).nullable().optional()
})

export const playlistUpdateSchema = z.object({
  id: idSchema,
  patch: z.object({
    name: textSchema.optional(),
    epgUrl: nullableText.optional(),
    userAgent: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
  })
})

export const channelQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  group: z.string().trim().max(200).optional(),
  playlistId: idSchema.nullable().optional(),
  favoritesOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).default(200),
  offset: z.number().int().min(0).default(0)
})

export const channelCreateSchema = z.object({
  playlistId: idSchema.nullable().optional(),
  name: textSchema,
  url: urlSchema,
  groupName: nullableText.optional(),
  logoUrl: nullableText.optional()
})

export const channelUpdateSchema = z.object({
  id: idSchema,
  patch: z.object({
    name: textSchema.optional(),
    url: urlSchema.optional(),
    groupName: nullableText.optional(),
    logoUrl: nullableText.optional(),
    isHidden: z.boolean().optional(),
    sortOrder: z.number().int().optional()
  })
})

export const importPreviewSchema = z.object({
  sourceType: z.enum(['url', 'file']),
  source: z.string().trim().min(1)
})

export const importRunSchema = z.object({
  name: textSchema,
  sourceType: z.enum(['url', 'file']),
  source: z.string().trim().min(1),
  playlistId: idSchema.optional(),
  pruneMissing: z.boolean().default(false)
})

export const streamStartSchema = z.object({
  channelId: idSchema,
  forceTranscode: z.boolean().default(false)
})

export const settingsSetSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.unknown()
})