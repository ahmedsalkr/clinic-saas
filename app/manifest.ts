import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clinic Center",
    short_name: "Clinic",
    description: "إدارة المركز الطبي",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#1d4ed8",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
