import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({
    base: "./src/content/posts",
    pattern: "**/*.{md,mdx}",
  }),
  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
  }),
});

const events = defineCollection({
  loader: glob({
    base: "./src/content/events",
    pattern: "**/*.{md,mdx}",
  }),
  schema: z.object({
    eventID: z.string(),
    title: z.string(),
    description: z.string().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    location: z.string().optional(),
    externalUrl: z.string().url().optional(),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    rsvpEnabled: z.boolean().default(false)
  }),
});

export const collections = { posts, events };
