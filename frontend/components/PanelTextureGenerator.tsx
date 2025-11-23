"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Sparkles, X } from "lucide-react"
import type { PanelId, PackageModel } from "@/lib/packaging-types"
import { usePanelTexture } from "@/hooks/usePanelTexture"

interface PanelTextureGeneratorProps {
  selectedPanelId: PanelId | null
  packageModel: PackageModel
  onTextureGenerated?: (panelId: PanelId, textureUrl: string) => void
}

export function PanelTextureGenerator({
  selectedPanelId,
  packageModel,
  onTextureGenerated,
}: PanelTextureGeneratorProps) {
  const [prompt, setPrompt] = useState("")
  const [currentTexture, setCurrentTexture] = useState<string | null>(null)
  const { generateTexture, getTexture, deleteTexture, generating, error } = usePanelTexture()

  // Load existing texture when panel changes
  useEffect(() => {
    if (selectedPanelId) {
      loadExistingTexture(selectedPanelId)
    } else {
      setCurrentTexture(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPanelId])

  const loadExistingTexture = async (panelId: PanelId) => {
    try {
      const texture = await getTexture(panelId)
      if (texture) {
        setCurrentTexture(texture.texture_url)
      } else {
        setCurrentTexture(null)
      }
    } catch (error) {
      // Silently handle 404s - it's expected if no texture exists
      setCurrentTexture(null)
    }
  }

  const handleGenerate = async () => {
    if (!selectedPanelId || !prompt.trim()) return

    const panel = packageModel.panels.find((p) => p.id === selectedPanelId)
    if (!panel) return

    // Calculate actual panel dimensions in mm based on package type and panel
    let panelDimensions: { width: number; height: number }
    
    if (packageModel.type === "box") {
      const { width, height, depth } = packageModel.dimensions
      // Box panel dimensions based on panel type
      if (selectedPanelId === "front" || selectedPanelId === "back") {
        panelDimensions = { width, height }
      } else if (selectedPanelId === "left" || selectedPanelId === "right") {
        panelDimensions = { width: depth, height }
      } else if (selectedPanelId === "top" || selectedPanelId === "bottom") {
        panelDimensions = { width, height: depth }
      } else {
        // Fallback to bounds if unknown panel
        panelDimensions = panel.bounds ? {
          width: panel.bounds.maxX - panel.bounds.minX,
          height: panel.bounds.maxY - panel.bounds.minY,
        } : { width: 100, height: 100 }
      }
    } else {
      // Cylinder
      const { width, height } = packageModel.dimensions
      if (selectedPanelId === "body") {
        const circumference = Math.PI * width
        panelDimensions = { width: circumference, height }
      } else {
        // Top or bottom - circular
        const radius = width / 2
        panelDimensions = { width: radius * 2, height: radius * 2 }
      }
    }

    const texture = await generateTexture({
      panel_id: selectedPanelId,
      prompt: prompt.trim(),
      package_type: packageModel.type,
      panel_dimensions,
      package_dimensions: packageModel.dimensions,
    })

    if (texture) {
      setCurrentTexture(texture.texture_url)
      onTextureGenerated?.(selectedPanelId, texture.texture_url)
    }
  }

  const handleDelete = async () => {
    if (!selectedPanelId) return
    const success = await deleteTexture(selectedPanelId)
    if (success) {
      setCurrentTexture(null)
    }
  }

  if (!selectedPanelId) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground text-center">
          Select a panel to generate a texture
        </p>
      </Card>
    )
  }

  const panel = packageModel.panels.find((p) => p.id === selectedPanelId)
  const isGenerating = generating === selectedPanelId

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Generate Texture</h3>
        {currentTexture && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="h-6 w-6 p-0"
            disabled={isGenerating}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {panel && (
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">{panel.name} Panel</p>
          <p>{panel.description}</p>
        </div>
      )}

      {currentTexture && (
        <div className="space-y-2">
          <Label className="text-xs">Current Texture</Label>
          <div className="relative aspect-video rounded border overflow-hidden bg-muted">
            <img
              src={currentTexture}
              alt={`Texture for ${selectedPanelId}`}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="texture-prompt" className="text-xs">
          Design Prompt
        </Label>
        <Textarea
          id="texture-prompt"
          placeholder="e.g., Modern minimalist design with blue and white colors, geometric patterns..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[80px] text-xs"
          disabled={isGenerating}
        />
        <p className="text-xs text-muted-foreground">
          Describe the design you want for this panel. The AI will generate a print-ready texture.
        </p>
      </div>

      {error && (
        <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <Button
        onClick={handleGenerate}
        disabled={!prompt.trim() || isGenerating}
        className="w-full"
        size="sm"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Texture
          </>
        )}
      </Button>
    </Card>
  )
}

