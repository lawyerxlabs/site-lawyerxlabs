// Thin entry: one build = one surface, selected by VITE_SURFACE (default LawyerLab).
// Profile data lives in src/surfaces/. Unknown ids fail closed.
import { SURFACES } from "@/surfaces"
import { resolveSurface as resolveIn } from "@/surfaces/core"
import type { SurfaceConfig } from "@/surfaces/contract"

export type { SurfaceConfig } from "@/surfaces"
export { SURFACES }

export function resolveSurface(id: string | undefined) {
  return resolveIn(id, SURFACES)
}

export function applySurfaceTheme(config: SurfaceConfig, root: HTMLElement = document.documentElement) {
  root.dataset.surface = config.id
  let icon = root.ownerDocument.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!icon) {
    icon = root.ownerDocument.createElement("link")
    icon.rel = "icon"
    icon.type = "image/svg+xml"
    root.ownerDocument.head.appendChild(icon)
  }
  icon.href = config.icon
  for (const [token, value] of Object.entries(config.theme ?? {})) root.style.setProperty(token, value)
}

export const surface = resolveSurface(import.meta.env.VITE_SURFACE)
