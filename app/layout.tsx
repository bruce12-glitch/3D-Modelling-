import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const title = "Neural Systems & AGI Lab — 3D Cognition Topology";
const description =
  "An interactive 3D force-directed topology of an AGI research lab: a dense reasoning core, seven orbiting agentic-memory satellites, and live inference highways rendered with WebGL, custom Three.js materials, and 720° camera choreography.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "Neural Systems & AGI Lab",
  authors: [{ name: "Neural Systems & AGI Lab" }],
  keywords: [
    "AGI",
    "agentic memory",
    "inference systems",
    "3D force graph",
    "WebGL",
    "Three.js",
    "react-force-graph-3d",
    "neural network visualization",
  ],
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "Neural Systems & AGI Lab",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#030508",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-lab-void">
      <body className="min-h-dvh bg-lab-void text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
