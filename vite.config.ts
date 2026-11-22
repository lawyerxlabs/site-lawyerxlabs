import path from "node:path"
import { defineConfig, loadEnv } from "vite"
import type { Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Static head metadata is LawyerLab by default. The Signal Lawyers build points
// absolute URLs (canonical, og:url, share image) at its own host and image.
const SIGNAL_TITLE = "Signal Lawyers — Know what you are signing, before you sign it"
const SIGNAL_DESCRIPTION = "Preparation tools for Ontario transactions. Signal Lawyers workflows require sign-in. Outputs support preparation and do not replace legal advice."
const SIGNAL_ALT = "Signal Lawyers: Know what you are signing, before you sign it. Preparation tools for Ontario transactions."
export function applySurfaceMeta(html: string, surface: string) {
  if (surface !== "signal-lawyers") return html
  return html
    .replace(/<title>[^<]*<\/title>/g, `<title>${SIGNAL_TITLE}</title>`)
    .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*/g, `$1${SIGNAL_DESCRIPTION}`)
    .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*/g, `$1${SIGNAL_TITLE}`)
    .replace(/(<meta (?:property="og:image:alt"|name="twitter:image:alt") content=")[^"]*/g, `$1${SIGNAL_ALT}`)
    .replace(/share-(?:lawyerlab|playground)\.png/g, "share-signal.png")
    .replaceAll("https://lawyerxlabs.com/", "https://lab.signallawyers.ca/")
    .replaceAll("https://lawyerlab.ca/", "https://lab.signallawyers.ca/")
    .replace(/<meta property="og:site_name" content="[^"]*" \/>/, '<meta property="og:site_name" content="Signal Lawyers" />')
    .replaceAll("LawyerLab", "Signal Lawyers")
}

export default defineConfig(({ mode }) => {
  const surface = loadEnv(mode, import.meta.dirname, "VITE_").VITE_SURFACE ?? ""
  const surfaceMeta: Plugin = { name: "surface-meta", transformIndexHtml: (html) => applySurfaceMeta(html, surface) }
  return {
    plugins: [react(), tailwindcss(), surfaceMeta],
    resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
    base: "/",
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: { input: { main: path.resolve(import.meta.dirname, "index.html"), playground: path.resolve(import.meta.dirname, "playground/index.html") } },
    },
    server: {
      host: "0.0.0.0",
      port: 7200,
      proxy: { "/v1": "http://localhost:7100", "/hr/v1": "http://localhost:7100", "/v2/hr": "http://localhost:7100", "/onboard/v1": "http://localhost:7100", "/tx/v1": "http://localhost:7100" },
    },
  }
})
