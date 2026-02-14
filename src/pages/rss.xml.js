import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = await getCollection("posts");
  return rss({
    title: "nikokomninos.com",
    description: "Niko Komninos",
    site: context.site,
    items: posts.map((post) => ({
      ...post.data,
      link: `/posts/${post.slug}/`,
      description: `About ${JSON.stringify(post.data.tags)}`,
    })),
  });
}
