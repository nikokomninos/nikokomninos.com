import { defineCollection, z } from "astro:content";
import { rssSchema } from "@astrojs/rss";

const posts = defineCollection({
  schema: rssSchema,
});

const projects = defineCollection({
  schema: z.object({
    title: z.string(),
    duration: z.string(),
  }),
});

export const collections = { posts, projects };
