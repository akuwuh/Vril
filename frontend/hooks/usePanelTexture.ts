import { useState } from "react"
import { API_ENDPOINTS } from "@/lib/api-config"

interface GenerateTextureRequest {
  panel_id: string
  prompt: string
  package_type: string
  panel_dimensions: { width: number; height: number }
  package_dimensions: { width: number; height: number; depth: number }
  reference_mockup?: string
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
  const [bulkGenerating, setBulkGenerating] = useState(false) // bulk generation in progress
  const [generatingPanels, setGeneratingPanels] = useState<string[]>([]) // panels being generated in bulk
  const [error, setError] = useState<string | null>(null)

  const generateTexture = async (request: GenerateTextureRequest): Promise<PanelTexture | null> => {
    console.log("[usePanelTexture] generateTexture called with:", request)
    setGenerating(request.panel_id)
    setError(null)

    // Record the timestamp BEFORE making the request
    const requestStartTime = new Date().toISOString()
    console.log("[usePanelTexture] Request started at:", requestStartTime)

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

      // Poll for completion - pass the request start time to filter out old textures
      console.log("[usePanelTexture] Starting to poll for texture...")
      const texture = await pollForTexture(request.panel_id, 60, requestStartTime)
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

  const pollForTexture = async (
    panelId: string, 
    maxAttempts = 60, 
    requestStartTime?: string
  ): Promise<PanelTexture | null> => {
    console.log("[usePanelTexture] pollForTexture started for panel:", panelId)
    console.log("[usePanelTexture] Only accepting textures generated after:", requestStartTime)
    
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) {
        // Exponential backoff: start at 2s, increase to max 8s
        const delay = Math.min(2000 * Math.pow(1.3, Math.min(i - 1, 5)), 8000)
        await new Promise((resolve) => setTimeout(resolve, delay))
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
              
              // IMPORTANT: Check if this texture was generated AFTER our request started
              if (requestStartTime && data.generated_at) {
                if (data.generated_at < requestStartTime) {
                  // Only log every 5th attempt to reduce noise
                  if (i % 5 === 0) {
                    console.warn(`[usePanelTexture] ⚠️ Found OLD texture for ${panelId}, ignoring`)
                    console.warn(`  Texture time: ${data.generated_at}`)
                    console.warn(`  Request time: ${requestStartTime}`)
                  }
                  throw new Error("Texture generation did not complete - got old texture")
                }
              }
              
              // Validate that texture_url exists and is not empty
              if (data.texture_url && data.texture_url.trim() !== '') {
                return data as PanelTexture
              }
              
              // If no texture_url, this is incomplete - wait for next check
              console.warn("[usePanelTexture] Found texture but no URL yet for " + panelId)
              continue
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
          
          // CRITICAL: Check if this texture was generated AFTER our request started
          if (requestStartTime && data.generated_at) {
            if (data.generated_at < requestStartTime) {
              // Only log every 5th attempt to reduce noise
              if (i % 5 === 0) {
                console.warn(`[usePanelTexture] ⚠️ Poll found OLD texture, continuing to wait...`)
                console.warn(`  Texture generated at: ${data.generated_at}`)
                console.warn(`  Request started at: ${requestStartTime}`)
              }
              continue // Keep polling for the NEW texture
            }
          }
          
          // Validate that texture_url exists and is not empty
          if (data.texture_url && data.texture_url.trim() !== '') {
            console.log("[usePanelTexture] ✅ Found NEW texture!", data)
            return data as PanelTexture
          }
          
          // If no texture_url, continue polling (might be incomplete data)
          if (i % 5 === 0) {
            console.warn("[usePanelTexture] Response OK but no texture_url yet, continuing...")
          }
          continue
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

  const generateAllTextures = async (request: {
    prompt: string
    package_type: string
    package_dimensions: { width: number; height: number; depth: number }
    panel_ids: string[]
    panels_info: Record<string, { width: number; height: number }>
    reference_mockup?: string
  }): Promise<boolean> => {
    console.log("[usePanelTexture] generateAllTextures called with:", request)
    setBulkGenerating(true)
    setGeneratingPanels(request.panel_ids)
    setError(null)

    // Record the timestamp BEFORE making the request
    const requestStartTime = new Date().toISOString()
    console.log("[usePanelTexture] Bulk request started at:", requestStartTime)

    try {
      console.log("[usePanelTexture] Making POST request to:", API_ENDPOINTS.packaging.generateAll)
      
      const response = await fetch(API_ENDPOINTS.packaging.generateAll, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      })

      console.log("[usePanelTexture] Response status:", response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Unknown error" }))
        const errorMsg = errorData.detail || `HTTP ${response.status}`
        console.error("[usePanelTexture] API error:", errorMsg)
        throw new Error(errorMsg)
      }

      const responseData = await response.json()
      console.log("[usePanelTexture] Bulk generation started:", responseData)

      // Poll for completion of all panels
      console.log("[usePanelTexture] Starting to poll for all textures...")
      await pollForAllTextures(request.panel_ids, requestStartTime)
      console.log("[usePanelTexture] All textures generated successfully")
      
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate textures"
      console.error("[usePanelTexture] Error in generateAllTextures:", err)
      setError(errorMessage)
      return false
    } finally {
      setBulkGenerating(false)
      setGeneratingPanels([])
    }
  }

  const pollForAllTextures = async (
    panelIds: string[],
    requestStartTime: string,
    maxAttempts = 180  // Longer timeout for multiple panels (6 minutes)
  ): Promise<void> => {
    console.log("[usePanelTexture] Polling for all panels:", panelIds)
    
    const completedPanels = new Set<string>()
    let lastProgressLog = 0
    
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 2000)) // Wait 2 seconds
      }

      // Check state to see current progress
      try {
        const stateResponse = await fetch(API_ENDPOINTS.packaging.getState)
        if (stateResponse.ok) {
          const state = await stateResponse.json()
          
          // If there's an error, stop polling
          if (state.last_error) {
            console.error("[usePanelTexture] Backend error:", state.last_error)
            throw new Error(state.last_error)
          }
          
          // If not generating anymore, do final check
          if (!state.bulk_generation_in_progress && state.generating_panels.length === 0) {
            console.log("[usePanelTexture] Bulk generation completed, doing final check...")
            break // Exit loop and do final check
          }
        }
      } catch (err) {
        // Continue polling even if state check fails
        if (i % 10 === 0) {
          console.warn("[usePanelTexture] State check failed:", err)
        }
      }

      // Check only completed panels (reduce 404 spam)
      // Only check panels that aren't already completed
      for (const panelId of panelIds) {
        if (completedPanels.has(panelId)) {
          continue // Already completed
        }

        try {
          const response = await fetch(API_ENDPOINTS.packaging.getTexture(panelId))
          
          if (response.ok) {
            const data = await response.json()
            
            // Check if this texture was generated AFTER our request started
            if (requestStartTime && data.generated_at) {
              if (data.generated_at < requestStartTime) {
                // Old texture, skip
                continue
              }
            }
            
            // Validate that texture_url exists
            if (data.texture_url && data.texture_url.trim() !== '') {
              console.log(`[usePanelTexture] ✅ Panel ${panelId} completed`)
              completedPanels.add(panelId)
              lastProgressLog = i // Update progress log time
            }
          } else if (response.status !== 404 && response.status !== 202) {
            // Log unexpected errors (but not 404s which are expected)
            if (i % 10 === 0) {
              console.warn(`[usePanelTexture] Unexpected status ${response.status} for panel ${panelId}`)
            }
          }
        } catch (err) {
          // Silently continue - network errors are expected during generation
        }
      }

      // Check if all panels are complete
      if (completedPanels.size === panelIds.length) {
        console.log("[usePanelTexture] ✅ All panels completed!")
        return
      }

      // Log progress only when it changes or every 15 seconds
      if (i - lastProgressLog >= 7) {
        console.log(`[usePanelTexture] Progress: ${completedPanels.size}/${panelIds.length} panels completed`)
        lastProgressLog = i
      }
    }

    // Do final check for all panels
    console.log("[usePanelTexture] Doing final check for all panels...")
    for (const panelId of panelIds) {
      if (completedPanels.has(panelId)) {
        continue
      }
      
      try {
        const response = await fetch(API_ENDPOINTS.packaging.getTexture(panelId))
        if (response.ok) {
          const data = await response.json()
          if (data.texture_url && data.texture_url.trim() !== '' && 
              (!requestStartTime || !data.generated_at || data.generated_at >= requestStartTime)) {
            console.log(`[usePanelTexture] ✅ Panel ${panelId} completed (final check)`)
            completedPanels.add(panelId)
          }
        }
      } catch (err) {
        console.warn(`[usePanelTexture] Final check failed for ${panelId}:`, err)
      }
    }

    // Check final results
    if (completedPanels.size === panelIds.length) {
      console.log("[usePanelTexture] ✅ All panels completed!")
      return
    }

    // Timeout - but don't fail if we got some panels
    if (completedPanels.size > 0) {
      const missing = panelIds.filter(id => !completedPanels.has(id))
      console.warn(`[usePanelTexture] Timeout: ${completedPanels.size}/${panelIds.length} panels completed. Missing: ${missing.join(', ')}`)
      throw new Error(`Partial completion: ${completedPanels.size}/${panelIds.length} panels done. Missing: ${missing.join(', ')}`)
    } else {
      console.error("[usePanelTexture] Timeout: no panels completed")
      throw new Error("Texture generation timeout - no panels completed")
    }
  }

  return {
    generateTexture,
    generateAllTextures,
    getTexture,
    deleteTexture,
    generating,
    bulkGenerating,
    generatingPanels,
    error,
  }
}

