"use client"

import type React from "react"

import { useRef, useEffect, useState } from "react"
import type { DielinePath, Panel, PanelId } from "@/lib/packaging-types"

interface DielineEditorProps {
  dielines: DielinePath[]
  panels?: Panel[]
  selectedPanelId?: PanelId | null
  onDielineChange?: (dielines: DielinePath[]) => void
  onPanelSelect?: (panelId: PanelId | null) => void
  editable?: boolean
  panelTextures?: Partial<Record<PanelId, string>>
}

export function DielineEditor({
  dielines,
  panels,
  selectedPanelId,
  onDielineChange,
  onPanelSelect,
  editable = true,
  panelTextures = {},
}: DielineEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedPoint, setSelectedPoint] = useState<{ pathIndex: number; pointIndex: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const hasInitialized = useRef(false)
  const initialDielinesRef = useRef<DielinePath[] | null>(null)
  const [loadedTextures, setLoadedTextures] = useState<Map<PanelId, HTMLImageElement>>(new Map())

  // Load textures when panelTextures change
  useEffect(() => {
    const textureMap = new Map<PanelId, HTMLImageElement>()
    const loadPromises: Promise<void>[] = []

    Object.entries(panelTextures).forEach(([panelId, textureUrl]) => {
      if (!textureUrl) return

      const img = new Image()
      img.crossOrigin = "anonymous"
      
      const loadPromise = new Promise<void>((resolve, reject) => {
        img.onload = () => {
          textureMap.set(panelId as PanelId, img)
          resolve()
        }
        img.onerror = () => {
          console.error(`Failed to load texture for panel ${panelId}`)
          resolve() // Resolve anyway to not block other textures
        }
        img.src = textureUrl
      })
      
      loadPromises.push(loadPromise)
    })

    Promise.all(loadPromises).then(() => {
      setLoadedTextures(textureMap)
    })
  }, [panelTextures])

  // Only auto-fit on initial load, preserve view when dielines change
  // Track the first set of dielines we see, and only initialize once
  useEffect(() => {
    if (!dielines.length) return

    // Only initialize if we haven't initialized before AND we haven't seen dielines yet
    // This ensures we only initialize once, even if dimensions change (including Z/depth)
    if (!hasInitialized.current && initialDielinesRef.current === null) {
      hasInitialized.current = true
      initialDielinesRef.current = dielines
      
      // Calculate bounds for initial fit
      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY

      dielines.forEach((path) => {
        path.points.forEach((point) => {
          minX = Math.min(minX, point.x)
          minY = Math.min(minY, point.y)
          maxX = Math.max(maxX, point.x)
          maxY = Math.max(maxY, point.y)
        })
      })

      const contentWidth = maxX - minX
      const contentHeight = maxY - minY
      
      // Only auto-fit if content is actually visible (has valid dimensions)
      if (contentWidth > 0 && contentHeight > 0) {
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        // Calculate scale to fit content with padding
        const padding = 50
        const scaleX = (1200 - padding * 2) / contentWidth
        const scaleY = (800 - padding * 2) / contentHeight
        const newScale = Math.min(scaleX, scaleY, 1)

        // Center the content
        const newOffsetX = 600 - centerX * newScale
        const newOffsetY = 400 - centerY * newScale

        setScale(newScale)
        setOffset({ x: newOffsetX, y: newOffsetY })
      }
    }
    // After initialization, we NEVER change scale/offset when dielines change
    // This preserves the user's view when dimensions are edited (X, Y, or Z)
    // even if the dieline bounding box changes size
  }, [dielines])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Set up canvas styling
    ctx.save()
    ctx.translate(offset.x, offset.y)
    ctx.scale(scale, scale)

    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height)

    // Draw panel regions if panels are provided
    if (panels) {
      panels.forEach((panel) => {
        if (panel.bounds && panel.dielinePathIndex !== undefined) {
          const texture = loadedTextures.get(panel.id)
          drawPanelRegion(ctx, panel, panel.id === selectedPanelId, texture)
        }
      })
    }

    // Calculate overall bounding box to determine outer edges
    let overallMinX = Number.POSITIVE_INFINITY
    let overallMinY = Number.POSITIVE_INFINITY
    let overallMaxX = Number.NEGATIVE_INFINITY
    let overallMaxY = Number.NEGATIVE_INFINITY
    
    dielines.forEach((path) => {
      path.points.forEach((point) => {
        overallMinX = Math.min(overallMinX, point.x)
        overallMinY = Math.min(overallMinY, point.y)
        overallMaxX = Math.max(overallMaxX, point.x)
        overallMaxY = Math.max(overallMaxY, point.y)
      })
    })

    // Draw all dieline paths
    dielines.forEach((path, pathIndex) => {
      const isSelected = panels
        ? panels.find((p) => p.dielinePathIndex === pathIndex)?.id === selectedPanelId
        : pathIndex === selectedPoint?.pathIndex
      drawDielinePath(ctx, path, isSelected, overallMinX, overallMinY, overallMaxX, overallMaxY)
    })

    ctx.restore()
  }, [dielines, scale, offset, selectedPoint, panels, selectedPanelId, loadedTextures])

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const baseGridSize = 20
    const gridSize = baseGridSize / scale // Adjust grid size based on zoom
    ctx.strokeStyle = scale > 0.5 ? "#f0f0f0" : "#e0e0e0"
    ctx.lineWidth = 0.5 / scale

    // Calculate grid bounds in world coordinates
    const startX = Math.floor(-offset.x / scale / gridSize) * gridSize
    const endX = startX + (width / scale) + gridSize
    const startY = Math.floor(-offset.y / scale / gridSize) * gridSize
    const endY = startY + (height / scale) + gridSize

    for (let x = startX; x <= endX; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, startY)
      ctx.lineTo(x, endY)
      ctx.stroke()
    }

    for (let y = startY; y <= endY; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(startX, y)
      ctx.lineTo(endX, y)
      ctx.stroke()
    }
  }

  const drawPanelRegion = (ctx: CanvasRenderingContext2D, panel: Panel, isSelected: boolean, texture?: HTMLImageElement) => {
    if (!panel.bounds) return

    const { minX, minY, maxX, maxY } = panel.bounds
    const width = maxX - minX
    const height = maxY - minY

    // Draw texture if available
    if (texture && texture.complete && texture.naturalWidth > 0) {
      ctx.save()
      // Create clipping path for the panel region
      ctx.beginPath()
      ctx.rect(minX, minY, width, height)
      ctx.clip()
      
      // Draw texture
      ctx.drawImage(texture, minX, minY, width, height)
      ctx.restore()
    } else {
      // Draw semi-transparent background only if no texture
      ctx.fillStyle = isSelected ? "rgba(251, 191, 36, 0.2)" : "rgba(59, 130, 246, 0.1)"
      ctx.fillRect(minX, minY, width, height)
    }

    // Draw border
    ctx.strokeStyle = isSelected ? "#fbbf24" : "#3b82f6"
    ctx.lineWidth = isSelected ? 2 / scale : 1 / scale
    ctx.setLineDash(isSelected ? [] : [5, 5])
    ctx.strokeRect(minX, minY, width, height)
    ctx.setLineDash([])

    // Draw panel label (with background for visibility over texture)
    if (texture && texture.complete && texture.naturalWidth > 0) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)"
      ctx.fillRect(minX + width / 2 - 30, minY + height / 2 - 8, 60, 16)
    }
    ctx.fillStyle = isSelected ? "#fbbf24" : "#3b82f6"
    ctx.font = `${12 / scale}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(panel.name, minX + width / 2, minY + height / 2)
  }

  const drawDimensionArc = (
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    distance: number,
    shapeCenterX?: number,
    shapeCenterY?: number
  ) => {
    // Calculate midpoint
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2

    // Calculate perpendicular direction (rotate 90 degrees)
    const dx = x2 - x1
    const dy = y2 - y1
    const length = Math.sqrt(dx * dx + dy * dy)
    
    if (length === 0) return

    // Normalize and rotate 90 degrees to get perpendicular vector
    // Two possible perpendicular directions: (-dy, dx) and (dy, -dx)
    let perpX = -dy / length
    let perpY = dx / length

    // Determine which side is "outside" - point away from shape center
    if (shapeCenterX !== undefined && shapeCenterY !== undefined) {
      // Check if the perpendicular vector points away from center
      const toCenterX = shapeCenterX - midX
      const toCenterY = shapeCenterY - midY
      const dotProduct = perpX * toCenterX + perpY * toCenterY
      
      // If dot product is positive, perpendicular points toward center, so flip it
      if (dotProduct > 0) {
        perpX = -perpX
        perpY = -perpY
      }
    }

    // Arc offset distance (perpendicular to edge, outside the shape)
    // Make it more pronounced for rainbow effect
    const arcOffset = 30 / scale
    const arcHeight = Math.max(15 / scale, Math.min(length / 6, 25 / scale)) // Height of rainbow curve

    // Extension line length (extend outward from edge)
    const extensionLength = 8 / scale

    // Calculate extension line endpoints (outside the edge)
    const ext1X = x1 + perpX * extensionLength
    const ext1Y = y1 + perpY * extensionLength
    const ext2X = x2 + perpX * extensionLength
    const ext2Y = y2 + perpY * extensionLength

    // Draw extension lines from edge endpoints outward
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(ext1X, ext1Y)
    ctx.moveTo(x2, y2)
    ctx.lineTo(ext2X, ext2Y)
    ctx.strokeStyle = "rgba(107, 114, 128, 0.4)"
    ctx.lineWidth = 0.5 / scale
    ctx.setLineDash([3, 3])
    ctx.stroke()
    ctx.setLineDash([])

    // Draw rainbow-shaped arc using quadratic curve for smooth arc
    // Control point is at the peak of the rainbow (further out)
    const controlX = midX + perpX * (arcOffset + arcHeight)
    const controlY = midY + perpY * (arcOffset + arcHeight)

    ctx.beginPath()
    ctx.moveTo(ext1X, ext1Y)
    ctx.quadraticCurveTo(controlX, controlY, ext2X, ext2Y)
    ctx.strokeStyle = "rgba(107, 114, 128, 0.5)"
    ctx.lineWidth = 0.8 / scale
    ctx.stroke()

    // Draw dimension text at the peak of the rainbow
    const textX = controlX
    const textY = controlY
    const edgeAngle = Math.atan2(dy, dx)

    ctx.save()
    ctx.fillStyle = "rgba(55, 65, 81, 0.7)"
    ctx.font = `${9 / scale}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    
    // Position text at rainbow peak, rotated to be perpendicular to edge
    ctx.translate(textX, textY)
    ctx.rotate(edgeAngle + Math.PI / 2)
    ctx.fillText(`${distance.toFixed(0)}`, 0, 0)
    ctx.restore()
  }

  const drawDielinePath = (
    ctx: CanvasRenderingContext2D,
    path: DielinePath,
    isSelected: boolean,
    overallMinX: number,
    overallMinY: number,
    overallMaxX: number,
    overallMaxY: number
  ) => {
    if (path.points.length === 0) return

    ctx.beginPath()
    ctx.moveTo(path.points[0].x, path.points[0].y)

    for (let i = 1; i < path.points.length; i++) {
      const point = path.points[i]
      ctx.lineTo(point.x, point.y)
    }

    if (path.closed) {
      ctx.closePath()
    }

    // Style based on point types
    const hasCutPoints = path.points.some((p) => p.type === "cut")

    if (hasCutPoints) {
      ctx.strokeStyle = "#ef4444" // Red for cut lines
      ctx.setLineDash([5, 5])
    } else {
      ctx.strokeStyle = isSelected ? "#3b82f6" : "#1f2937"
      ctx.setLineDash([])
    }

    ctx.lineWidth = isSelected ? 2 : 1.5
    ctx.stroke()
    ctx.setLineDash([])

    const points = path.points
    
    // Calculate shape center for determining outside direction
    let shapeCenterX: number | undefined
    let shapeCenterY: number | undefined
    if (path.closed && points.length > 0) {
      const sumX = points.reduce((sum, p) => sum + p.x, 0)
      const sumY = points.reduce((sum, p) => sum + p.y, 0)
      shapeCenterX = sumX / points.length
      shapeCenterY = sumY / points.length
    }
    
    // Helper to check if an edge is on the outer perimeter
    const isOuterEdge = (x1: number, y1: number, x2: number, y2: number): boolean => {
      const tolerance = 1 // Tolerance for floating point comparison
      
      // Check if edge is horizontal and on top or bottom boundary
      const isHorizontal = Math.abs(y1 - y2) < tolerance
      if (isHorizontal) {
        const y = (y1 + y2) / 2
        if (Math.abs(y - overallMinY) < tolerance || Math.abs(y - overallMaxY) < tolerance) {
          // Check if edge spans within the bounding box horizontally
          const minX = Math.min(x1, x2)
          const maxX = Math.max(x1, x2)
          return minX >= overallMinX - tolerance && maxX <= overallMaxX + tolerance
        }
      }
      
      // Check if edge is vertical and on left or right boundary
      const isVertical = Math.abs(x1 - x2) < tolerance
      if (isVertical) {
        const x = (x1 + x2) / 2
        if (Math.abs(x - overallMinX) < tolerance || Math.abs(x - overallMaxX) < tolerance) {
          // Check if edge spans within the bounding box vertically
          const minY = Math.min(y1, y2)
          const maxY = Math.max(y1, y2)
          return minY >= overallMinY - tolerance && maxY <= overallMaxY + tolerance
        }
      }
      
      return false
    }
    
    // Draw dimension arcs only for outer perimeter edges
    for (let i = 0; i < points.length; i++) {
      const currentPoint = points[i]
      const nextPoint = points[(i + 1) % points.length]
      
      // Only draw dimension if not the last point (unless path is closed)
      if (i < points.length - 1 || path.closed) {
        const dx = nextPoint.x - currentPoint.x
        const dy = nextPoint.y - currentPoint.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        // Only draw dimension on outer edges and if edge is long enough
        if (distance > 10 && isOuterEdge(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y)) {
          drawDimensionArc(
            ctx,
            currentPoint.x,
            currentPoint.y,
            nextPoint.x,
            nextPoint.y,
            distance,
            shapeCenterX,
            shapeCenterY
          )
        }
      }
    }

    // Draw points
    path.points.forEach((point, pointIndex) => {
      const isPointSelected =
        selectedPoint?.pathIndex === path.points.indexOf(point) && selectedPoint?.pointIndex === pointIndex

      ctx.beginPath()
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)

      if (point.type === "fold") {
        ctx.fillStyle = "#10b981" // Green for fold lines
      } else if (point.type === "cut") {
        ctx.fillStyle = "#ef4444" // Red for cut lines
      } else {
        ctx.fillStyle = "#3b82f6" // Blue for corners
      }

      if (isPointSelected) {
        ctx.fillStyle = "#fbbf24" // Yellow for selected
      }

      ctx.fill()
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 1
      ctx.stroke()
    })
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable) return

    const canvas = canvasRef.current
    if (!canvas) return

    // Middle mouse button for panning
    if (e.button === 1) {
      setIsPanning(true)
      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - offset.x) / scale
    const y = (e.clientY - rect.top - offset.y) / scale

    // First check if clicking on a panel region
    if (panels && onPanelSelect) {
      for (const panel of panels) {
        if (panel.bounds && panel.dielinePathIndex !== undefined) {
          const { minX, minY, maxX, maxY } = panel.bounds
          if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
            // Clicked on a panel
            if (panel.id === selectedPanelId) {
              onPanelSelect(null) // Deselect if clicking same panel
            } else {
              onPanelSelect(panel.id)
            }
            setSelectedPoint(null)
            return
          }
        }
      }
    }

    // Find clicked point
    for (let pathIndex = 0; pathIndex < dielines.length; pathIndex++) {
      const path = dielines[pathIndex]
      for (let pointIndex = 0; pointIndex < path.points.length; pointIndex++) {
        const point = path.points[pointIndex]
        const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2)

        if (distance < 8 / scale) { // Adjust click tolerance for scale
          setSelectedPoint({ pathIndex, pointIndex })
          setIsDragging(true)
          return
        }
      }
    }

    setSelectedPoint(null)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable) return

    // Handle panning
    if (isPanning) {
      const deltaX = e.clientX - lastPanPoint.x
      const deltaY = e.clientY - lastPanPoint.y

      setOffset(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))

      setLastPanPoint({ x: e.clientX, y: e.clientY })
      return
    }

    if (!isDragging || !selectedPoint) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - offset.x) / scale
    const y = (e.clientY - rect.top - offset.y) / scale

    const newDielines = [...dielines]
    newDielines[selectedPoint.pathIndex].points[selectedPoint.pointIndex] = {
      ...newDielines[selectedPoint.pathIndex].points[selectedPoint.pointIndex],
      x,
      y,
    }

    onDielineChange?.(newDielines)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setIsPanning(false)
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setScale((prev) => Math.max(0.1, Math.min(3, prev * delta)))
  }

  const generateSVG = (paths: DielinePath[]): string => {
    // Calculate bounds
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    paths.forEach((path) => {
      path.points.forEach((point) => {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      })
    })

    const padding = 20
    const width = maxX - minX + padding * 2
    const height = maxY - minY + padding * 2
    const viewBox = `${minX - padding} ${minY - padding} ${width} ${height}`

    const pathElements = paths.map((path, i) => {
      const pathString = path.points.map((point, idx) =>
        `${idx === 0 ? "M" : "L"} ${point.x} ${point.y}`
      ).join(" ")

      let strokeColor = "#94a3b8" // Default gray

      // Color code by path type
      if (path.points.length > 0) {
        const firstPointType = path.points[0].type
        if (firstPointType === "fold") strokeColor = "#10b981" // Green for fold lines
        if (firstPointType === "cut") strokeColor = "#ef4444" // Red for cut lines
      }

      return `<path d="${pathString + (path.closed ? " Z" : "")}" fill="none" stroke="${strokeColor}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />`
    }).join("\n    ")

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
  ${pathElements}
</svg>`
  }

  return (
    <div className="relative w-full h-full bg-white rounded-lg border border-border overflow-hidden">
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-crosshair'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg border border-border p-3 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#3b82f6]" />
          <span className="text-muted-foreground">Corner</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#10b981]" />
          <span className="text-muted-foreground">Fold Line</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#ef4444]" />
          <span className="text-muted-foreground">Cut Line</span>
        </div>
      </div>


      {/* Controls */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg border border-border p-2 flex items-center gap-2">
        <button
          onClick={() => setScale((prev) => Math.min(3, prev * 1.2))}
          className="px-3 py-1 text-sm bg-background hover:bg-muted rounded border border-border"
          title="Zoom In"
        >
          +
        </button>
        <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((prev) => Math.max(0.1, prev * 0.8))}
          className="px-3 py-1 text-sm bg-background hover:bg-muted rounded border border-border"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={() => {
            setScale(1)
            setOffset({ x: 0, y: 0 })
          }}
          className="px-3 py-1 text-sm bg-background hover:bg-muted rounded border border-border"
          title="Reset View"
        >
          Reset
        </button>
        <button
          onClick={() => {
            if (!dielines.length) return

            // Calculate bounds of all paths
            let minX = Number.POSITIVE_INFINITY
            let minY = Number.POSITIVE_INFINITY
            let maxX = Number.NEGATIVE_INFINITY
            let maxY = Number.NEGATIVE_INFINITY

            dielines.forEach((path) => {
              path.points.forEach((point) => {
                minX = Math.min(minX, point.x)
                minY = Math.min(minY, point.y)
                maxX = Math.max(maxX, point.x)
                maxY = Math.max(maxY, point.y)
              })
            })

            const contentWidth = maxX - minX
            const contentHeight = maxY - minY
            const centerX = (minX + maxX) / 2
            const centerY = (minY + maxY) / 2

            // Calculate scale to fit content with padding
            const padding = 50
            const scaleX = (1200 - padding * 2) / contentWidth
            const scaleY = (800 - padding * 2) / contentHeight
            const newScale = Math.min(scaleX, scaleY, 1) // Don't zoom in beyond 100%

            // Center the content
            const newOffsetX = 600 - centerX * newScale
            const newOffsetY = 400 - centerY * newScale

            setScale(newScale)
            setOffset({ x: newOffsetX, y: newOffsetY })
          }}
          className="px-3 py-1 text-sm bg-background hover:bg-muted rounded border border-border"
          title="Fit to View"
        >
          Fit
        </button>
      </div>
    </div>
  )
}
