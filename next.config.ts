import type { NextConfig } from "next";

// The GitHub Pages workflow sets GITHUB_PAGES=true to emit a static site served
// from /<repo-name>. Local dev and other hosts (e.g. Vercel) build normally.
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repoName = "3D-Modelling-";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isGitHubPages && {
    output: "export",
    basePath: `/${repoName}`,
    assetPrefix: `/${repoName}/`,
    images: { unoptimized: true },
    trailingSlash: true,
  }),
};

export default nextConfig;
