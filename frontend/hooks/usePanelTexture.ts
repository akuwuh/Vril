import { useState } from "react"
import { API_ENDPOINTS } from "@/lib/api-config"

interface GenerateTextureRequest {
  panel_id: string
  prompt: string
  package_type: string
  panel_dimensions: { width: number; height: number }
  package_dimensions: { width: number; height: number; depth: number }
}

interface PanelTexture {
  panel_id: string
  texture_url: string
  prompt: string
  generated_at: string
  dimensions?: { width: number; height: number }
}

export function usePanelTexture() {
  const [generating, setGenerating] = useState<string | null>(null) // panel_id being generated
  const [error, setError] = useState<string | null>(null)

  const generateTexture = async (request: GenerateTextureRequest): Promise<PanelTexture | null> => {
    console.log("[usePanelTexture] generateTexture called with:", request)
    setGenerating(request.panel_id)
    setError(null)

    try {
      console.log("[usePanelTexture] Making POST request to:", API_ENDPOINTS.packaging.generate)
      console.log("[usePanelTexture] Request body:", JSON.stringify(request, null, 2))
      
      let response: Response
      try {
        response = await fetch(API_ENDPOINTS.packaging.generate, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        })
      } catch (fetchError) {
        console.error("[usePanelTexture] Fetch error:", fetchError)
        if (fetchError instanceof TypeError && fetchError.message.includes("fetch")) {
          throw new Error(`Cannot connect to backend at ${API_ENDPOINTS.packaging.generate}. Make sure the backend is running on http://localhost:8000`)
        }
        throw fetchError
      }

      console.log("[usePanelTexture] Response status:", response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }))
        const errorMsg = errorData.detail || `HTTP ${response.status}`
        console.error("[usePanelTexture] API error:", errorMsg)
        throw new Error(errorMsg)
      }

      const responseData = await response.json()
      console.log("[usePanelTexture] Initial response:", responseData)

      // Poll for completion
      console.log("[usePanelTexture] Starting to poll for texture...")
      const texture = await pollForTexture(request.panel_id)
      console.log("[usePanelTexture] Polling complete, texture:", texture ? "received" : "null")
      return texture
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate texture"
      console.error("[usePanelTexture] Error in generateTexture:", err)
      setError(errorMessage)
      return null
    } finally {
      setGenerating(null)
    }
  }

  const pollForTexture = async (panelId: string, maxAttempts = 60): Promise<PanelTexture | null> => {
    console.log("[usePanelTexture] pollForTexture started for panel:", panelId)
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds (skip first iteration)
      }

      try {
        // Check state first to see if there's an error or if generation stopped
        const stateResponse = await fetch(API_ENDPOINTS.packaging.getState)
        if (stateResponse.ok) {
          const state = await stateResponse.json()
          
          // If there's an error, stop polling
          if (state.last_error) {
            console.error("[usePanelTexture] State has error:", state.last_error)
            throw new Error(state.last_error)
          }
          
          // If generation is not in progress and this panel is not being generated, stop polling
          if (!state.in_progress && state.generating_panel !== panelId) {
            // Check one more time if texture exists (might have been generated just before state updated)
            const textureResponse = await fetch(API_ENDPOINTS.packaging.getTexture(panelId))
            if (textureResponse.ok) {
              const data = await textureResponse.json()
              return data as PanelTexture
            }
            // No texture and not generating - stop polling
            console.log(`[usePanelTexture] Generation not in progress for panel ${panelId}, stopping poll`)
            throw new Error("Texture generation not in progress")
          }
        }

        // Try to get the texture
        const textureUrl = API_ENDPOINTS.packaging.getTexture(panelId)
        if (i % 5 === 0) { // Only log every 5th attempt to reduce noise
          console.log(`[usePanelTexture] Poll attempt ${i + 1}/${maxAttempts} for panel ${panelId}`)
        }
        const response = await fetch(textureUrl)
        
        if (response.ok) {
          const data = await response.json()
          console.log("[usePanelTexture] Texture found!", data)
          return data as PanelTexture
        } else if (response.status === 202) {
          // Generation in progress (202 Accepted) - continue polling
          if (i % 5 === 0) {
            console.log(`[usePanelTexture] Generation in progress for panel ${panelId} (202)`)
          }
          continue
        } else if (response.status === 404) {
          // Check if generation is still in progress via state
          const stateResponse = await fetch(API_ENDPOINTS.packaging.getState)
          if (stateResponse.ok) {
            const state = await stateResponse.json()
            if (state.in_progress && state.generating_panel === panelId) {
              // Still generating, continue polling
              if (i % 5 === 0) {
                console.log(`[usePanelTexture] Texture not ready yet, generation in progress (404)`)
              }
              continue
            }
          }
          // Not generating and no texture - stop polling
          console.log(`[usePanelTexture] No texture found and generation not in progress, stopping poll`)
          throw new Error("Texture not found and generation not in progress")
        } else {
          console.error(`[usePanelTexture] Unexpected status ${response.status}`)
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (err) {
        if (i === maxAttempts - 1) {
          console.error("[usePanelTexture] Max attempts reached, throwing error")
          throw err
        }
        // Continue polling on error (unless it's a final error)
        if (err instanceof Error && (
          err.message.includes("Failed to generate") || 
          err.message.includes("not in progress")
        )) {
          console.error("[usePanelTexture] Generation failed or stopped, stopping poll")
          throw err
        }
        // Log but continue for other errors (only every 5th attempt)
        if (i % 5 === 0) {
          console.warn(`[usePanelTexture] Poll attempt ${i + 1} error:`, err)
        }
      }
    }

    console.error("[usePanelTexture] Polling timeout after", maxAttempts, "attempts")
    throw new Error("Texture generation timeout")
  }

  const getTexture = async (panelId: string): Promise<PanelTexture | null> => {
    try {
      const response = await fetch(API_ENDPOINTS.packaging.getTexture(panelId))
      if (response.ok) {
        return (await response.json()) as PanelTexture
      }
      // 404 is expected if texture doesn't exist - don't log as error
      // 202 means generation in progress - also expected
      if (response.status === 404 || response.status === 202) {
        return null
      }
      // Other errors should be logged
      console.warn(`[usePanelTexture] getTexture failed with status ${response.status} for panel ${panelId}`)
      return null
    } catch (error) {
      // Network errors should be logged
      console.warn(`[usePanelTexture] getTexture network error for panel ${panelId}:`, error)
      return null
    }
  }

  const deleteTexture = async (panelId: string): Promise<boolean> => {
    try {
      const response = await fetch(API_ENDPOINTS.packaging.deleteTexture(panelId), {
        method: "DELETE",
      })
      return response.ok
    } catch {
      return false
    }
  }

  return {
    generateTexture,
    getTexture,
    deleteTexture,
    generating,
    error,
  }
}

