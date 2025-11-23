// Backend state types for persistence
export interface PanelTexture {
  panel_id: string;
  texture_url: string;
  prompt: string;
  generated_at: string;
  dimensions?: { width: number; height: number };
}

export interface PackagingState {
  package_type: PackageType;
  package_dimensions: PackageDimensions;
  panel_textures: Record<string, PanelTexture>;
  in_progress: boolean;
  generating_panel: string | null;
  generating_panels: string[];
  bulk_generation_in_progress: boolean;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackagingStatus {
  in_progress: boolean;
  generating_panel: string | null;
  generating_panels: string[];
  last_error: string | null;
  updated_at: string;
}

// Package type definitions and configurations
export type PackageType = "box" | "cylinder"

export interface PackageDimensions {
  width: number
  height: number
  depth: number
}

export interface PackageConfig {
  type: PackageType
  dimensions: PackageDimensions
  name: string
  icon: string
}

// Dieline point for 2D editing
export interface DielinePoint {
  x: number
  y: number
  type: "corner" | "fold" | "cut"
}

export interface DielinePath {
  points: DielinePoint[]
  closed: boolean
  panelId?: PanelId // Link to panel identifier
}

// Panel identifiers for boxes
export type BoxPanelId = "front" | "back" | "left" | "right" | "top" | "bottom"
// Panel identifiers for cylinders
export type CylinderPanelId = "body" | "top" | "bottom"
export type PanelId = BoxPanelId | CylinderPanelId

// Panel structure for 3D model
export interface Panel {
  id: PanelId
  name: string
  description: string
  dielinePathIndex?: number // Index in dielines array
  bounds?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  // 3D geometry information
  geometry?: {
    faceIndex?: number // For box faces
    position?: { x: number; y: number; z: number }
    normal?: { x: number; y: number; z: number }
  }
}

// Panel state for design patterns
export interface PanelState {
  panelId: PanelId
  designPattern?: string // Type of design pattern applied
  textureUrl?: string // URL to texture/design image
  color?: string
  metadata?: Record<string, any>
}

// Complete package model structure
export interface PackageModel {
  type: PackageType
  dimensions: PackageDimensions
  panels: Panel[]
  dielines: DielinePath[]
  panelStates: Record<PanelId, PanelState>
}

// Default dimensions for each package type
export const DEFAULT_PACKAGE_DIMENSIONS: Record<PackageType, PackageDimensions> = {
  box: { width: 100, height: 150, depth: 100 },
  cylinder: { width: 80, height: 150, depth: 80 },
}

// Generate dieline paths based on package type and dimensions
export function generateDieline(type: PackageType, dimensions: PackageDimensions): DielinePath[] {
  const { width, height, depth } = dimensions

  switch (type) {
    case "box":
      return generateBoxDieline(width, height, depth)
    case "cylinder":
      return generateCylinderDieline(width, height, depth)
    default:
      return []
  }
}

// Box dieline generator (classic box with flaps)
function generateBoxDieline(w: number, h: number, d: number): DielinePath[] {
  const margin = 10
  const flapSize = d * 0.5

  // Top flap
  const topFlap: DielinePoint[] = [
    { x: margin + w, y: margin, type: "corner" },
    { x: margin + w + d, y: margin, type: "corner" },
    { x: margin + w + d, y: margin + flapSize, type: "fold" },
    { x: margin + w, y: margin + flapSize, type: "fold" },
  ]

  // Front face
  const frontFace: DielinePoint[] = [
    { x: margin + w, y: margin + flapSize, type: "fold" },
    { x: margin + w + d, y: margin + flapSize, type: "fold" },
    { x: margin + w + d, y: margin + flapSize + h, type: "fold" },
    { x: margin + w, y: margin + flapSize + h, type: "fold" },
  ]

  // Bottom flap
  const bottomFlap: DielinePoint[] = [
    { x: margin + w, y: margin + flapSize + h, type: "fold" },
    { x: margin + w + d, y: margin + flapSize + h, type: "fold" },
    { x: margin + w + d, y: margin + flapSize + h + d, type: "corner" },
    { x: margin + w, y: margin + flapSize + h + d, type: "corner" },
  ]

  // Left side panel
  const leftPanel: DielinePoint[] = [
    { x: margin, y: margin + flapSize, type: "corner" },
    { x: margin + w, y: margin + flapSize, type: "fold" },
    { x: margin + w, y: margin + flapSize + h, type: "fold" },
    { x: margin, y: margin + flapSize + h, type: "corner" },
  ]

  // Right side panel
  const rightPanel: DielinePoint[] = [
    { x: margin + w + d, y: margin + flapSize, type: "fold" },
    { x: margin + w + d + w, y: margin + flapSize, type: "fold" },
    { x: margin + w + d + w, y: margin + flapSize + h, type: "fold" },
    { x: margin + w + d, y: margin + flapSize + h, type: "fold" },
  ]

  // Back panel
  const backPanel: DielinePoint[] = [
    { x: margin + w + d + w, y: margin + flapSize, type: "fold" },
    { x: margin + w + d + w + d, y: margin + flapSize, type: "corner" },
    { x: margin + w + d + w + d, y: margin + flapSize + h, type: "corner" },
    { x: margin + w + d + w, y: margin + flapSize + h, type: "fold" },
  ]

  return [
    { points: topFlap, closed: true, panelId: "top" },
    { points: frontFace, closed: true, panelId: "front" },
    { points: bottomFlap, closed: true, panelId: "bottom" },
    { points: leftPanel, closed: true, panelId: "left" },
    { points: rightPanel, closed: true, panelId: "right" },
    { points: backPanel, closed: true, panelId: "back" },
  ]
}

// Cylinder dieline (wrap around label)
function generateCylinderDieline(w: number, h: number, d: number): DielinePath[] {
  const margin = 10
  const circumference = Math.PI * w

  // Body wrap
  const bodyPath: DielinePoint[] = [
    { x: margin, y: margin + w / 2, type: "fold" },
    { x: margin + circumference, y: margin + w / 2, type: "fold" },
    { x: margin + circumference, y: margin + w / 2 + h, type: "fold" },
    { x: margin, y: margin + w / 2 + h, type: "fold" },
  ]

  // Top circle (approximated with octagon)
  const topCircle: DielinePoint[] = []
  const topCenterX = margin + circumference / 2
  const topCenterY = margin
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8
    topCircle.push({
      x: topCenterX + Math.cos(angle) * (w / 2),
      y: topCenterY + Math.sin(angle) * (w / 2),
      type: i === 0 ? "fold" : "corner",
    })
  }

  // Bottom circle
  const bottomCircle: DielinePoint[] = []
  const bottomCenterX = margin + circumference / 2
  const bottomCenterY = margin + w / 2 + h + w / 2
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI * 2) / 8
    bottomCircle.push({
      x: bottomCenterX + Math.cos(angle) * (w / 2),
      y: bottomCenterY + Math.sin(angle) * (w / 2),
      type: i === 0 ? "fold" : "corner",
    })
  }

  return [
    { points: bodyPath, closed: true, panelId: "body" },
    { points: topCircle, closed: true, panelId: "top" },
    { points: bottomCircle, closed: true, panelId: "bottom" },
  ]
}

// Generate panel structure from package type and dimensions
export function generatePackageModel(
  type: PackageType,
  dimensions: PackageDimensions
): PackageModel {
  const dielines = generateDieline(type, dimensions)
  const panels: Panel[] = []

  if (type === "box") {
    const { width, height, depth } = dimensions
    // Panel order must match dieline generation order: [top, front, bottom, left, right, back]
    const boxPanels: BoxPanelId[] = ["top", "front", "bottom", "left", "right", "back"]
    
    boxPanels.forEach((panelId, index) => {
      const dielinePath = dielines[index]
      const bounds = calculateBounds(dielinePath.points)
      
      panels.push({
        id: panelId,
        name: panelId.charAt(0).toUpperCase() + panelId.slice(1),
        description: getBoxPanelDescription(panelId, width, height, depth),
        dielinePathIndex: index,
        bounds,
        geometry: {
          faceIndex: index,
        },
      })
    })
  } else if (type === "cylinder") {
    const { width, height } = dimensions
    const cylinderPanels: CylinderPanelId[] = ["body", "top", "bottom"]
    
    cylinderPanels.forEach((panelId, index) => {
      const dielinePath = dielines[index]
      const bounds = calculateBounds(dielinePath.points)
      
      panels.push({
        id: panelId,
        name: panelId.charAt(0).toUpperCase() + panelId.slice(1),
        description: getCylinderPanelDescription(panelId, width, height),
        dielinePathIndex: index,
        bounds,
      })
    })
  }

  // Initialize panel states
  const panelStates: Record<PanelId, PanelState> = {} as Record<PanelId, PanelState>
  panels.forEach((panel) => {
    panelStates[panel.id] = {
      panelId: panel.id,
    }
  })

  return {
    type,
    dimensions,
    panels,
    dielines,
    panelStates,
  }
}

// Calculate bounding box from points
function calculateBounds(points: DielinePoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  points.forEach((point) => {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  })

  return { minX, minY, maxX, maxY }
}

// Get description for box panel
function getBoxPanelDescription(panelId: BoxPanelId, width: number, height: number, depth: number): string {
  const descriptions: Record<BoxPanelId, string> = {
    front: `Front face of the box (${width}mm × ${height}mm). This is the primary visible panel when the box is displayed.`,
    back: `Back face of the box (${width}mm × ${height}mm). Opposite side of the front panel.`,
    left: `Left side panel (${depth}mm × ${height}mm). Connects front and back panels.`,
    right: `Right side panel (${depth}mm × ${height}mm). Connects front and back panels.`,
    top: `Top face of the box (${width}mm × ${depth}mm). Usually the opening or lid area.`,
    bottom: `Bottom face of the box (${width}mm × ${depth}mm). Base of the package.`,
  }
  return descriptions[panelId]
}

// Get description for cylinder panel
function getCylinderPanelDescription(panelId: CylinderPanelId, width: number, height: number): string {
  const radius = width / 2
  const circumference = Math.PI * width
  
  const descriptions: Record<CylinderPanelId, string> = {
    body: `Cylindrical body wrap (${circumference.toFixed(1)}mm × ${height}mm). The curved surface that wraps around the cylinder.`,
    top: `Top circular face (radius: ${radius}mm). The circular cap at the top of the cylinder.`,
    bottom: `Bottom circular face (radius: ${radius}mm). The circular base of the cylinder.`,
  }
  return descriptions[panelId]
}

// Update package model when dielines change
export function updateModelFromDielines(
  model: PackageModel,
  newDielines: DielinePath[]
): PackageModel {
  // Update dielines
  const updatedDielines = newDielines.map((path, index) => {
    const panel = model.panels.find((p) => p.dielinePathIndex === index)
    return {
      ...path,
      panelId: panel?.id || path.panelId,
    }
  })

  // Update panel bounds from new dieline points
  const updatedPanels = model.panels.map((panel) => {
    if (panel.dielinePathIndex !== undefined) {
      const path = updatedDielines[panel.dielinePathIndex]
      const bounds = calculateBounds(path.points)
      return {
        ...panel,
        bounds,
      }
    }
    return panel
  })

  return {
    ...model,
    dielines: updatedDielines,
    panels: updatedPanels,
  }
}
