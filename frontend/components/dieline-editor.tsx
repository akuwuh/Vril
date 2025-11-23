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
}

export function DielineEditor({
  dielines,
  panels,
  selectedPanelId,
  onDielineChange,
  onPanelSelect,
  editable = true,
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
          drawPanelRegion(ctx, panel, panel.id === selectedPanelId)
        }
      })
    }

    // Draw all dieline paths
    dielines.forEach((path, pathIndex) => {
      const isSelected = panels
        ? panels.find((p) => p.dielinePathIndex === pathIndex)?.id === selectedPanelId
        : pathIndex === selectedPoint?.pathIndex
      drawDielinePath(ctx, path, isSelected)
    })

    ctx.restore()
  }, [dielines, scale, offset, selectedPoint, panels, selectedPanelId])

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

  const drawPanelRegion = (ctx: CanvasRenderingContext2D, panel: Panel, isSelected: boolean) => {
    if (!panel.bounds) return

    const { minX, minY, maxX, maxY } = panel.bounds
    const width = maxX - minX
    const height = maxY - minY

    // Draw semi-transparent background
    ctx.fillStyle = isSelected ? "rgba(251, 191, 36, 0.2)" : "rgba(59, 130, 246, 0.1)"
    ctx.fillRect(minX, minY, width, height)

    // Draw border
    ctx.strokeStyle = isSelected ? "#fbbf24" : "#3b82f6"
    ctx.lineWidth = isSelected ? 2 / scale : 1 / scale
    ctx.setLineDash(isSelected ? [] : [5, 5])
    ctx.strokeRect(minX, minY, width, height)
    ctx.setLineDash([])

    // Draw panel label
    ctx.fillStyle = isSelected ? "#fbbf24" : "#3b82f6"
    ctx.font = `${12 / scale}px sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(panel.name, minX + width / 2, minY + height / 2)
  }

  const drawDielinePath = (ctx: CanvasRenderingContext2D, path: DielinePath, isSelected: boolean) => {
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

      {/* Toolbar */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg border border-border p-2 flex items-center gap-1">
        <button
          onClick={() => {
            // Add a new point at the center of the view
            if (!dielines.length) return
            const centerX = (-offset.x + 600) / scale
            const centerY = (-offset.y + 400) / scale

            const newDielines = [...dielines]
            if (newDielines[0]) {
              newDielines[0].points.push({
                x: centerX,
                y: centerY,
                type: "corner"
              })
              onDielineChange?.(newDielines)
            }
          }}
          className="px-3 py-1 text-sm bg-background hover:bg-muted rounded border border-border"
          title="Add Point"
        >
          +
        </button>
        <button
          onClick={() => {
            // Remove selected point
            if (!selectedPoint) return
            const newDielines = [...dielines]
            newDielines[selectedPoint.pathIndex].points.splice(selectedPoint.pointIndex, 1)
            onDielineChange?.(newDielines)
            setSelectedPoint(null)
          }}
          className="px-3 py-1 text-sm bg-background hover:bg-muted rounded border border-border disabled:opacity-50"
          disabled={!selectedPoint}
          title="Remove Point"
        >
          −
        </button>
        <button
          onClick={() => {
            // Export as SVG
            const svgContent = generateSVG(dielines)
            const blob = new Blob([svgContent], { type: 'image/svg+xml' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'dieline.svg'
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="px-3 py-1 text-sm bg-background hover:bg-muted rounded border border-border"
          title="Export SVG"
        >
          💾
        </button>
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
