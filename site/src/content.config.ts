import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "../packages/counterfact/docs" }),
  schema: z.object({}).passthrough(),
});

export const collections = { docs };
