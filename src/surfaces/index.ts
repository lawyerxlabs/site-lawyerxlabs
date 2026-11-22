import { lawyerlab } from "./lawyerlab"
import { signalLawyers } from "./signal-lawyers"
import { humanResources } from "./human-resources"
import type { SurfaceConfig } from "./contract"

export const SURFACES: Record<string, SurfaceConfig> = { lawyerlab, "signal-lawyers": signalLawyers, "human-resources": humanResources }

export { lawyerlab, signalLawyers, humanResources }
export type { SurfaceConfig } from "./contract"
