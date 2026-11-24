import { createFileRoute } from "@tanstack/react-router";
import App from "@/game/App";
import "@/game/fonts.css";
import "@/game/game.css";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Huss Valley — Tag & Movement" },
      { name: "description", content: "A blocky 3D movement and tag game: run, jump, slide, vault and chain bunny hops." },
      { property: "og:title", content: "Huss Valley — Tag & Movement" },
      { property: "og:description", content: "A blocky 3D movement and tag game: run, jump, slide, vault and chain bunny hops." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});
