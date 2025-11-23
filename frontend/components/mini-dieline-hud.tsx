"use client"

import { useEffect, useState } from "react"
import type { DielinePath, PanelId, Panel } from "@/lib/packaging-types"

interface MiniDielineHudProps {
  dielines: DielinePath[]
  panels?: Panel[]
  panelTextures?: Partial<Record<PanelId, string>>
}

export function MiniDielineHud({ dielines, panels, panelTextures = {} }: MiniDielineHudProps) {
  const [loadedTextures, setLoadedTextures] = useState<Map<PanelId, string>>(new Map())

  // Load textures and convert to data URLs for SVG use
  useEffect(() => {
    // Clear textures if panelTextures is empty
    if (Object.keys(panelTextures).length === 0) {
      setLoadedTextures(new Map())
      return
    }

    const textureMap = new Map<PanelId, string>()
    const loadPromises: Promise<void>[] = []
    let hasDirectUrls = false

    Object.entries(panelTextures).forEach(([panelId, textureUrl]) => {
      if (!textureUrl) return

      // If it's already a data URL or blob URL, use it directly (SVG can use both)
      if (textureUrl.startsWith('data:') || textureUrl.startsWith('blob:')) {
        textureMap.set(panelId as PanelId, textureUrl)
        hasDirectUrls = true
        return
      }

      // Otherwise, fetch remote URL and convert to data URL
      const loadPromise = fetch(textureUrl)
        .then(res => {
          if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`)
          return res.blob()
        })
        .then(blob => {
          return new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              if (reader.result) {
                resolve(reader.result as string)
              } else {
                reject(new Error('Failed to read blob'))
              }
            }
            reader.onerror = () => reject(new Error('FileReader error'))
            reader.readAsDataURL(blob)
          })
        })
        .then(dataUrl => {
          textureMap.set(panelId as PanelId, dataUrl)
        })
        .catch((err) => {
          console.error(`Failed to load texture for panel ${panelId}:`, err)
          // Silently fail for individual textures
        })
      
      loadPromises.push(loadPromise)
    })

    // Update state immediately with direct URLs (data URLs or blob URLs) if any
    if (hasDirectUrls) {
      setLoadedTextures(new Map(textureMap))
    }

    // Update again when all fetch promises resolve
    if (loadPromises.length > 0) {
      Promise.all(loadPromises).then(() => {
        setLoadedTextures(new Map(textureMap))
      })
    } else if (hasDirectUrls) {
      // If we only had direct URLs, state is already set above
      // But ensure we trigger a re-render
      setLoadedTextures(prev => new Map(textureMap))
    }
  }, [panelTextures])

  if (!dielines || dielines.length === 0) return null

  // Calculate the bounding box of all paths
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

  const width = maxX - minX
  const height = maxY - minY
  // Use fixed padding percentage to prevent visual shifts when one dimension changes
  // This ensures the viewBox doesn't change based on which dimension is largest
  const paddingPercent = 0.1
  const paddingX = width * paddingPercent
  const paddingY = height * paddingPercent

  // Calculate viewBox with independent padding for each axis
  const viewBoxX = minX - paddingX
  const viewBoxY = minY - paddingY
  const viewBoxWidth = width + paddingX * 2
  const viewBoxHeight = height + paddingY * 2

  return (
    <div className="absolute bottom-4 right-4 bg-card/95 backdrop-blur-sm border border-border rounded-lg p-2 shadow-lg">
      <div className="text-xs font-medium text-muted-foreground mb-1 px-1">Dieline</div>
      <svg
        width="180"
        height="180"
        viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
        className="bg-background/50 rounded"
      >
        <defs>
          {panels?.map((panel) => {
            const textureDataUrl = loadedTextures.get(panel.id)
            if (!textureDataUrl || !panel.bounds) return null
            
            const panelWidth = panel.bounds.maxX - panel.bounds.minX
            const panelHeight = panel.bounds.maxY - panel.bounds.minY
            
            return (
              <pattern
                key={`pattern-${panel.id}`}
                id={`texture-${panel.id}`}
                patternUnits="userSpaceOnUse"
                x={panel.bounds.minX}
                y={panel.bounds.minY}
                width={panelWidth}
                height={panelHeight}
              >
                <image
                  href={textureDataUrl}
                  x={panel.bounds.minX}
                  y={panel.bounds.minY}
                  width={panelWidth}
                  height={panelHeight}
                  preserveAspectRatio="none"
                />
              </pattern>
            )
          })}
        </defs>
        
        {/* Draw panel textures as rectangles - must be before dieline paths */}
        {panels?.map((panel) => {
          if (!panel.bounds) return null
          const textureDataUrl = loadedTextures.get(panel.id)
          
          // Only render if we have a texture
          if (!textureDataUrl) return null
          
          return (
            <rect
              key={`panel-texture-${panel.id}`}
              x={panel.bounds.minX}
              y={panel.bounds.minY}
              width={panel.bounds.maxX - panel.bounds.minX}
              height={panel.bounds.maxY - panel.bounds.minY}
              fill={`url(#texture-${panel.id})`}
            />
          )
        })}

        {/* Draw dieline paths on top */}
        {dielines.map((path, i) => {
          const pathString = path.points.map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")

          let strokeColor = "#94a3b8" // Default gray

          // Color code by path type based on first point
          if (path.points.length > 0) {
            const firstPointType = path.points[0].type
            if (firstPointType === "fold") strokeColor = "#10b981" // Green for fold lines
            if (firstPointType === "cut") strokeColor = "#ef4444" // Red for cut lines
          }

          return (
            <path
              key={i}
              d={pathString + (path.closed ? " Z" : "")}
              fill="none"
              stroke={strokeColor}
              strokeWidth={Math.min(viewBoxWidth, viewBoxHeight) * 0.005}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        })}
      </svg>
    </div>
  )
}
