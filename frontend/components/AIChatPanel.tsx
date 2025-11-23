"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RotateCcw, ImagePlus } from "lucide-react";
import { editProduct, getProductStatus, rewindProduct } from "@/lib/product-api";
import { clearCachedModel } from "@/lib/model-cache";
import { ProductState, ProductStatus } from "@/lib/product-types";
import type { PanelId, PackageModel } from "@/lib/packaging-types";
import { usePanelTexture } from "@/hooks/usePanelTexture";
import { API_ENDPOINTS } from "@/lib/api-config";

// Product editing props
interface ProductAIChatPanelProps {
  productState: ProductState | null;
  isEditInProgress: boolean;
  onEditStart: () => void;
  onEditComplete: () => Promise<void> | void;
  onEditError: () => void;
  selectedPanelId?: never;
  packageModel?: never;
  onTextureGenerated?: never;
}

// Packaging texture generation props
interface PackagingAIChatPanelProps {
  selectedPanelId?: PanelId | null;
  packageModel?: PackageModel;
  onTextureGenerated?: (panelId: PanelId, textureUrl: string) => void;
  onGenerationStart?: () => void; // Notify parent when generation starts
  packagingState?: any; // PackagingState from backend
  isGenerating?: boolean; // Parent tracks if generation is in progress
  productState?: never;
  isEditInProgress?: never;
  onEditStart?: never;
  onEditComplete?: never;
  onEditError?: never;
}

type AIChatPanelProps = ProductAIChatPanelProps | PackagingAIChatPanelProps;

export function AIChatPanel(props: AIChatPanelProps) {
  // Determine if this is product editing or packaging texture generation
  const isProductMode = "productState" in props;
  
  if (isProductMode) {
    return <ProductAIChatPanel {...(props as ProductAIChatPanelProps)} />;
  }
  return <PackagingAIChatPanel {...(props as PackagingAIChatPanelProps)} />;
}

function ProductAIChatPanel({
  productState,
  isEditInProgress,
  onEditStart,
  onEditComplete,
  onEditError,
}: ProductAIChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [editStatus, setEditStatus] = useState<ProductStatus | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const cleanStatusMessage = useCallback((message?: string) => {
    if (!message) return "Generating model...";
    let cleaned = message.replace(/progress:\s*/i, "");
    cleaned = cleaned.replace(/\[[^\]]*\]/g, "").trim();
    return cleaned || "Generating model...";
  }, []);

  const suggestions = [
    "Make the model taller",
    "Change the color to blue",
    "Add more details",
    "Rotate the model 90 degrees",
    "Make it smaller",
    "Add lighting effects",
  ];

  // Avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Track elapsed time during generation - use backend's generation_started_at if available
  useEffect(() => {
    if (!isEditInProgress) {
      setElapsedTime(0);
      return;
    }

    // Use backend start time if available, otherwise use current time
    const startTime = productState?.generation_started_at 
      ? new Date(productState.generation_started_at).getTime()
      : Date.now();
    
    // Set initial elapsed time immediately
    setElapsedTime(Math.floor((Date.now() - startTime) / 1000));

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isEditInProgress, productState?.generation_started_at]);

  // Poll backend status while edit is running
  useEffect(() => {
    if (!isEditInProgress) {
      setEditStatus(null);
      return;
    }

    console.log("[ProductAIChatPanel] 🔄 Starting status polling");
    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const status = await getProductStatus();
        if (isCancelled) {
          return;
        }
        console.log("[ProductAIChatPanel] 📊 Status:", status.status, status.progress);
        setEditStatus(status);

        if (status.status === "complete") {
          console.log("[ProductAIChatPanel] ✅ Generation complete!");
          await onEditComplete();
          return;
        }

        if (status.status === "error") {
          console.error("[ProductAIChatPanel] ❌ Generation error");
          onEditError();
          return;
        }
      } catch (error) {
        console.error("[ProductAIChatPanel] Failed to poll product status:", error);
      }

      if (!isCancelled) {
        timeoutId = setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isEditInProgress, onEditComplete, onEditError]);

  const iterations = useMemo(() => productState?.iterations ?? [], [productState?.iterations]);
  const canEdit = Boolean(productState?.images?.length);

  const formatDuration = (value?: number) => {
    if (value === undefined || value === null) {
      return null;
    }
    if (value < 60) {
      return `${Math.max(1, Math.round(value))}s`;
    }
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remMinutes = minutes % 60;
      return `${hours}h ${remMinutes}m`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  };

  const formatElapsedTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || !canEdit) return;

    try {
      onEditStart();
      await editProduct(prompt.trim());
      setPrompt("");
    } catch (error) {
      console.error("Edit failed:", error);
      onEditError();
    }
  };

  const handleRewind = async (iterationIndex: number) => {
    try {
      setRewindTarget(iterationIndex);
      await rewindProduct(iterationIndex);
      if (productState?.iterations?.length) {
        const staleIterations = productState.iterations.slice(iterationIndex + 1);
        await Promise.all(staleIterations.map((iteration) => clearCachedModel(iteration.id)));
      }
      await onEditComplete();
    } catch (error) {
      console.error("Rewind failed:", error);
      onEditError();
    } finally {
      setRewindTarget(null);
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      {!canEdit && (
        <div className="text-xs p-3 border-2 border-dashed border-muted-foreground rounded-lg text-muted-foreground">
          Generate a base product first to unlock editing.
        </div>
      )}

      {isEditInProgress && editStatus && (
        <div className="p-3 bg-background border-4 border-black space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wide">
              <div className="w-3 h-3 border-2 border-black animate-spin" />
              {cleanStatusMessage(editStatus.message)}
            </div>
            <div className="font-mono text-sm font-bold tabular-nums">
              {formatElapsedTime(elapsedTime)}
            </div>
          </div>
          <div className="space-y-1">
            <div className="w-full h-6 border-2 border-black bg-white relative overflow-hidden">
            <div
                className="h-full bg-black transition-all duration-500 relative"
              style={{ width: `${Math.min(editStatus.progress || 0, 100)}%` }}
              >
                <div className="absolute inset-0 opacity-20" style={{
                  backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, white 2px, white 4px)'
                }} />
              </div>
            </div>
            <div className="text-right font-mono text-xs font-bold tabular-nums">
              {Math.min(editStatus.progress || 0, 100)}%
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          placeholder={canEdit ? "Describe changes..." : "Generate a base product first"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[80px] resize-none text-sm"
          disabled={isEditInProgress || !canEdit}
        />
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isEditInProgress || !canEdit}
          variant="outline"
          className="w-full"
          size="sm"
        >
          {isEditInProgress ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            "Apply Changes"
          )}
        </Button>
      </div>

      {isMounted && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setPrompt(suggestion)}
                disabled={isEditInProgress || !canEdit}
                className="text-xs px-2.5 py-1.5 bg-secondary text-secondary-foreground rounded-full border-2 border-black hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {iterations.length > 0 && (
        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <div className="text-xs font-semibold text-muted-foreground">History</div>
          <div className="space-y-2 overflow-y-auto flex-1">
            {iterations
              .slice()
              .reverse()
              .map((iteration, idx) => {
                const actualIndex = iterations.length - 1 - idx;
                const isCurrent = actualIndex === iterations.length - 1;

                return (
                  <div
                    key={`${iteration.created_at}-${actualIndex}`}
                    className={`text-xs p-2.5 rounded-lg border-2 ${
                      isCurrent ? "bg-primary/10 border-primary" : "bg-muted border-black"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium line-clamp-2">{iteration.prompt}</p>
                        <p className="text-muted-foreground text-[10px] mt-1">
                          {iteration.type} • {new Date(iteration.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {formatDuration(iteration.duration_seconds) && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDuration(iteration.duration_seconds)}
                          </span>
                        )}
                        {!isCurrent && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 border border-black rounded-full"
                            disabled={isEditInProgress || rewindTarget === actualIndex}
                            onClick={() => handleRewind(actualIndex)}
                            title="Rewind to this version"
                          >
                            {rewindTarget === actualIndex ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3 h-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function PackagingAIChatPanel({ 
  selectedPanelId, 
  packageModel,
  onTextureGenerated,
  onGenerationStart,
  packagingState,
  isGenerating
}: PackagingAIChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Array<{ prompt: string; response: string }>>([]);
  const [referenceMockup, setReferenceMockup] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { generateTexture, generateAllTextures, bulkGenerating, error } = usePanelTexture();
  
  // Use parent's isGenerating state OR local bulkGenerating/isProcessing
  const showGenerating = isGenerating || bulkGenerating || isProcessing;
  const showBulkGenerating = (packagingState?.bulk_generation_in_progress) || bulkGenerating;

  // Validate prompt in real-time - memoized for performance
  const validatePrompt = useCallback((text: string) => {
    const trimmed = text.trim();
    
    if (trimmed.length === 0) {
      setValidationError(null);
      return null;
    }
    
    if (trimmed.length < 3) {
      const error = "Prompt is too short. Please be more specific.";
      setValidationError(error);
      return error;
    }
    
    // Check for overly vague prompts - expanded list
    const vague = ["logo", "design", "texture", "pattern", "cool", "nice", "good", "emblem", "symbol", "brand"];
    const words = trimmed.toLowerCase().split(/\s+/);
    
    // Check if prompt is just a vague word or "X logo" pattern
    if (vague.includes(trimmed.toLowerCase()) || 
        (words.length === 2 && vague.includes(words[1]))) {
      const error = `"${trimmed}" is too vague. Please describe what style, colors, or patterns you want. Example: "blue geometric pattern with white lines"`;
      setValidationError(error);
      return error;
    }
    
    setValidationError(null);
    return null;
  }, []);

  // Auto-validate when prompt changes (backup to onChange)
  useEffect(() => {
    if (prompt) {
      validatePrompt(prompt);
    }
  }, [prompt, validatePrompt]);

  // Handle reference mockup upload
  const handleMockupUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setHistory([
        ...history,
        {
          prompt: "Reference upload",
          response: "Image too large. Please use an image under 5MB.",
        },
      ]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setReferenceMockup(base64);
      setHistory([
        ...history,
        {
          prompt: "Reference mockup uploaded",
          response: "Reference image uploaded successfully. Your next generation will use this as a style guide.",
        },
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateAll = async () => {
    console.log("[AIChatPanel] handleGenerateAll called", { prompt, hasPackageModel: !!packageModel });
    
    if (!prompt.trim()) {
      console.log("[AIChatPanel] Prompt is empty, returning");
      return;
    }
    
    // Check validation
    if (validationError) {
      setHistory([
        ...history,
        {
          prompt: prompt.trim(),
          response: validationError,
        },
      ]);
      return;
    }

    if (!packageModel) {
      console.log("[AIChatPanel] No package model");
      setHistory([
        ...history,
        {
          prompt,
          response: "Package model not available.",
        },
      ]);
      setPrompt("");
      return;
    }

    setIsProcessing(true);
    console.log("[AIChatPanel] Starting bulk texture generation...");

    try {
      // Prepare panel information
      const panelIds = packageModel.panels.map(p => p.id);
      const panelsInfo: Record<string, { width: number; height: number }> = {};
      
      for (const panel of packageModel.panels) {
        let panelDimensions: { width: number; height: number };
        
        if (packageModel.type === "box") {
          const { width, height, depth } = packageModel.dimensions;
          if (panel.id === "front" || panel.id === "back") {
            panelDimensions = { width, height };
          } else if (panel.id === "left" || panel.id === "right") {
            panelDimensions = { width: depth, height };
          } else {
            panelDimensions = { width, height: depth };
          }
        } else {
          // Cylinder
          const { width, height } = packageModel.dimensions;
          if (panel.id === "body") {
            const circumference = Math.PI * width;
            panelDimensions = { width: circumference, height };
          } else {
            const radius = width / 2;
            panelDimensions = { width: radius * 2, height: radius * 2 };
          }
        }
        
        panelsInfo[panel.id] = panelDimensions;
      }

      console.log("[AIChatPanel] Calling generateAllTextures with:", {
        panel_ids: panelIds,
        prompt: prompt.trim(),
        package_type: packageModel.type,
      });

      // Notify parent that generation is starting
      onGenerationStart?.();

      const success = await generateAllTextures({
        prompt: prompt.trim(),
        package_type: packageModel.type,
        package_dimensions: packageModel.dimensions,
        panel_ids: panelIds,
        panels_info: panelsInfo,
        reference_mockup: referenceMockup || undefined,
      });

      if (success) {
        console.log("[AIChatPanel] Bulk generation completed, fetching textures");
        setHistory([
          ...history,
          {
            prompt,
            response: `Successfully generated textures for all ${panelIds.length} panels!`,
          },
        ]);
        
        // Fetch all textures and notify parent
        for (const panelId of panelIds) {
          try {
            const response = await fetch(API_ENDPOINTS.packaging.getTexture(panelId));
            if (response.ok) {
              const data = await response.json();
              if (data.texture_url) {
                onTextureGenerated?.(panelId, data.texture_url);
              }
            }
          } catch (err) {
            console.warn(`[AIChatPanel] Could not fetch texture for ${panelId}:`, err);
          }
        }
      } else {
        const errorMsg = error || "Failed to generate textures. Please try again.";
        console.error("[AIChatPanel] Bulk generation failed:", errorMsg);
        setHistory([
          ...history,
          {
            prompt,
            response: errorMsg,
          },
        ]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      console.error("[AIChatPanel] Error in handleGenerateAll:", err);
      setHistory([
        ...history,
        {
          prompt,
          response: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setPrompt("");
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    console.log("[AIChatPanel] handleSubmit called", { prompt, selectedPanelId, hasPackageModel: !!packageModel });
    
    if (!prompt.trim()) {
      console.log("[AIChatPanel] Prompt is empty, returning");
      return;
    }
    
    // Check validation
    if (validationError) {
      setHistory([
        ...history,
        {
          prompt: prompt.trim(),
          response: validationError,
        },
      ]);
      return;
    }

    // If no panel is selected, show error
    if (!selectedPanelId) {
      console.log("[AIChatPanel] No panel selected");
      setHistory([
        ...history,
        {
          prompt,
          response: "Please select a panel first to apply changes.",
        },
      ]);
      setPrompt("");
      return;
    }

    if (!packageModel) {
      console.log("[AIChatPanel] No package model");
      setHistory([
        ...history,
        {
          prompt,
          response: "Package model not available.",
        },
      ]);
      setPrompt("");
      return;
    }

    setIsProcessing(true);
    console.log("[AIChatPanel] Starting texture generation...");

    try {
      // Calculate panel dimensions
      const panel = packageModel.panels.find((p) => p.id === selectedPanelId);
      if (!panel) {
        throw new Error("Panel not found");
      }

      let panelDimensions: { width: number; height: number };
      
      if (packageModel.type === "box") {
        const { width, height, depth } = packageModel.dimensions;
        if (selectedPanelId === "front" || selectedPanelId === "back") {
          panelDimensions = { width, height };
        } else if (selectedPanelId === "left" || selectedPanelId === "right") {
          panelDimensions = { width: depth, height };
        } else {
          panelDimensions = { width, height: depth };
        }
      } else {
        // Cylinder
        const { width, height } = packageModel.dimensions;
        if (selectedPanelId === "body") {
          const circumference = Math.PI * width;
          panelDimensions = { width: circumference, height };
        } else {
          const radius = width / 2;
          panelDimensions = { width: radius * 2, height: radius * 2 };
        }
      }

      console.log("[AIChatPanel] Calling generateTexture with:", {
        panel_id: selectedPanelId,
        prompt: prompt.trim(),
        package_type: packageModel.type,
        panel_dimensions: panelDimensions,
      });

      // Test backend connectivity first - try both localhost and 127.0.0.1
      let backendReachable = false;
      const testUrls = ["http://127.0.0.1:8000/health", "http://localhost:8000/health"];
      
      for (const testUrl of testUrls) {
        try {
          const testResponse = await fetch(testUrl);
          if (testResponse.ok) {
            console.log(`[AIChatPanel] Backend connectivity test passed using ${testUrl}`);
            backendReachable = true;
            break;
          }
        } catch (testError) {
          console.warn(`[AIChatPanel] Failed to connect to ${testUrl}:`, testError);
        }
      }
      
      if (!backendReachable) {
        console.error("[AIChatPanel] Backend connectivity test failed for all URLs");
        setHistory([
          ...history,
          {
            prompt,
            response: `Cannot connect to backend. Make sure it's running on http://127.0.0.1:8000 or http://localhost:8000. Check the backend terminal for errors.`,
          },
        ]);
        setPrompt("");
        setIsProcessing(false);
        return;
      }

      // Generate texture using the prompt with optional reference mockup
      const texture = await generateTexture({
        panel_id: selectedPanelId,
        prompt: prompt.trim(),
        package_type: packageModel.type,
        panel_dimensions: panelDimensions,
        package_dimensions: packageModel.dimensions,
        reference_mockup: referenceMockup || undefined,
      });

      console.log("[AIChatPanel] Texture generation result:", texture ? "success" : "failed", { error });

      if (texture && texture.texture_url) {
        console.log("[AIChatPanel] Texture generated successfully, calling onTextureGenerated");
        console.log("[AIChatPanel] Texture URL:", texture.texture_url.substring(0, 100) + "...");
        setHistory([
          ...history,
          {
            prompt,
            response: `Successfully applied "${prompt}" to the ${panel.name} panel.`,
          },
        ]);
        onTextureGenerated?.(selectedPanelId, texture.texture_url);
      } else if (texture && !texture.texture_url) {
        console.error("[AIChatPanel] Texture object exists but texture_url is missing:", texture);
        setHistory([
          ...history,
          {
            prompt,
            response: "Texture generation completed but no image was returned. The AI may have refused the request or encountered an error.",
          },
        ]);
      } else {
        const errorMsg = error || "Failed to generate texture. Please try again.";
        console.error("[AIChatPanel] Texture generation failed:", errorMsg);
        setHistory([
          ...history,
          {
            prompt,
            response: errorMsg,
          },
        ]);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      console.error("[AIChatPanel] Error in handleSubmit:", err);
      setHistory([
        ...history,
        {
          prompt,
          response: `Error: ${errorMessage}`,
        },
      ]);
    } finally {
      setPrompt("");
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Prompt Input with Upload Button */}
      <div className="relative">
        <Textarea
        placeholder="Describe style, colors, patterns..."
          value={prompt}
          onChange={(e) => {
            const newValue = e.target.value;
            setPrompt(newValue);
            // Validate immediately on change
            validatePrompt(newValue);
          }}
          onBlur={(e) => {
            // Re-validate on blur to catch any edge cases
            validatePrompt(e.target.value);
          }}
          className={`min-h-[120px] resize-none text-sm pr-10 ${
            validationError ? "border-red-500 border-2 focus:border-red-600" : ""
          }`}
          disabled={isProcessing || showBulkGenerating}
        />
        
        {/* Upload Button Inside Textarea */}
                <input
                  type="file"
          id="reference-upload"
                  accept="image/*"
                  onChange={handleMockupUpload}
          className="hidden"
          disabled={isProcessing || showBulkGenerating}
                />
        <label
          htmlFor="reference-upload"
          className={`absolute bottom-2 right-2 p-1.5 rounded border-2 border-black bg-background hover:bg-muted transition-colors cursor-pointer ${
            isProcessing || showBulkGenerating ? "opacity-50 cursor-not-allowed" : ""
          } ${referenceMockup ? "bg-green-100 border-green-600" : ""}`}
          title={referenceMockup ? "Reference image loaded (click to change)" : "Upload reference image"}
        >
          <ImagePlus className={`w-4 h-4 ${referenceMockup ? "text-green-600" : ""}`} />
        </label>
      </div>
        
      {/* Reference Status */}
                {referenceMockup && (
        <div className="flex items-center justify-between text-xs p-2 bg-green-50 border-2 border-green-600 rounded">
          <span className="font-medium text-green-700">Reference image loaded</span>
                    <button
                      onClick={() => setReferenceMockup(null)}
            className="font-semibold text-red-600 hover:underline"
                    >
                      Remove
                    </button>
        </div>
          )}
        
      {/* Validation error */}
      {validationError && (
        <div className="text-xs text-red-600 dark:text-red-400 font-medium p-2 bg-red-50 dark:bg-red-950 rounded border-2 border-red-500">
          {validationError}
        </div>
      )}
        
      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={(e) => {
            e.preventDefault();
            console.log("[AIChatPanel] Generate panel button clicked", { prompt: prompt.trim(), isProcessing, selectedPanelId });
            handleSubmit();
          }}
          disabled={!prompt.trim() || isProcessing || showBulkGenerating || !selectedPanelId || !!validationError}
          variant="outline"
          className="w-full text-xs font-semibold"
          size="sm"
        >
          {isProcessing && !showBulkGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Panel"
          )}
        </Button>
        
        <Button
          onClick={(e) => {
            e.preventDefault();
            console.log("[AIChatPanel] Generate all button clicked", { prompt: prompt.trim(), isProcessing, bulkGenerating });
            handleGenerateAll();
          }}
          disabled={!prompt.trim() || isProcessing || showBulkGenerating || !!validationError}
          variant="default"
          className="w-full text-xs font-semibold"
          size="sm"
        >
          {showBulkGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Generating All...
            </>
          ) : (
            "Generate All Panels"
          )}
        </Button>
      </div>

      {/* Progress Status */}
      {(isProcessing || showBulkGenerating) && (
        <div className="text-xs p-2.5 bg-muted rounded border-2 border-black space-y-1">
          {showBulkGenerating ? (
            <>
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <p className="font-semibold">Generating panels in parallel</p>
            </div>
              {packagingState?.generating_panels && packagingState.generating_panels.length > 0 && (
                <p className="text-muted-foreground">
                  {packagingState.generating_panels.length} panel(s) remaining
                </p>
              )}
              <p className="text-muted-foreground">This may take 1-3 minutes</p>
            </>
          ) : (
            <p className="text-muted-foreground">Generating (10-30 seconds)</p>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2 pt-2 border-t-2 border-black">
          <div className="text-xs font-semibold text-muted-foreground">HISTORY</div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {history
              .slice()
              .reverse()
              .map((item, i) => (
                <div key={i} className="text-xs p-2.5 bg-muted/50 rounded border-2 border-black">
                  <p className="font-semibold mb-1.5">{item.prompt}</p>
                  <p className="text-muted-foreground text-[11px] leading-relaxed">{item.response}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
