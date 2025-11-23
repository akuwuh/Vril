"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RotateCcw } from "lucide-react";
import { editProduct, getProductStatus, rewindProduct } from "@/lib/product-api";
import { clearCachedModel } from "@/lib/model-cache";
import { ProductState, ProductStatus } from "@/lib/product-types";
import type { PanelId, PackageModel } from "@/lib/packaging-types";
import { usePanelTexture } from "@/hooks/usePanelTexture";

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

  // Poll backend status while edit is running
  useEffect(() => {
    if (!isEditInProgress) {
      setEditStatus(null);
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const status = await getProductStatus();
        if (isCancelled) {
          return;
        }
        setEditStatus(status);

        if (status.status === "complete") {
          await onEditComplete();
          return;
        }

        if (status.status === "error") {
          onEditError();
          return;
        }
      } catch (error) {
        console.error("Failed to poll product status:", error);
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
        <div className="p-3 bg-blue-50 border-2 border-blue-500 rounded-lg text-xs space-y-2">
          <div className="flex items-center gap-2 font-medium text-blue-900">
            <Loader2 className="w-4 h-4 animate-spin" />
            {editStatus.message || "Processing edit..."}
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(editStatus.progress || 0, 100)}%` }}
            />
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
  onTextureGenerated 
}: PackagingAIChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Array<{ prompt: string; response: string }>>([]);
  const [referenceMockup, setReferenceMockup] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { generateTexture, error } = usePanelTexture();

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

      if (texture) {
        console.log("[AIChatPanel] Texture generated successfully, calling onTextureGenerated");
        setHistory([
          ...history,
          {
            prompt,
            response: `Successfully applied "${prompt}" to the ${panel.name} panel.`,
          },
        ]);
        onTextureGenerated?.(selectedPanelId, texture.texture_url);
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
    <div className="space-y-3 flex-1 flex flex-col">
      {/* Prompt Input */}
      <div className="space-y-2">
        {!selectedPanelId && (
          <p className="text-xs text-muted-foreground mb-1">
            Select a panel first to apply changes
          </p>
        )}
        
        {/* Helpful examples */}
        {selectedPanelId && !prompt && (
          <div className="text-xs bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-2 space-y-1">
            <p className="font-medium text-blue-900 dark:text-blue-100">💡 Example prompts:</p>
            <p className="text-blue-700 dark:text-blue-300">• "Vintage cardboard texture with subtle grain"</p>
            <p className="text-blue-700 dark:text-blue-300">• "Black and white geometric checkerboard pattern"</p>
            <p className="text-blue-700 dark:text-blue-300">• "Navy blue with thin white diagonal stripes"</p>
          </div>
        )}
        
        <Textarea
          placeholder={selectedPanelId ? "Be specific: describe style, colors, patterns..." : "Select a panel first..."}
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
          className={`min-h-[80px] resize-none text-sm transition-all ${
            validationError ? "border-red-500 border-2 focus:border-red-600" : ""
          }`}
          disabled={isProcessing || !selectedPanelId}
        />
        
        {/* Validation error */}
        {validationError && (
          <p className="text-xs text-red-600 dark:text-red-400">
            ⚠️ {validationError}
          </p>
        )}
        
        {/* Advanced Options */}
        <div className="border rounded p-2 space-y-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between w-full"
          >
            <span>⚙️ Advanced Options</span>
            <span>{showAdvanced ? "▼" : "▶"}</span>
          </button>
          
          {showAdvanced && (
            <div className="space-y-2 pt-2 border-t">
              <div className="space-y-1">
                <label className="text-xs font-medium block">Reference Mockup (Optional)</label>
                <p className="text-xs text-muted-foreground mb-1">
                  Upload a reference image to match its style
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleMockupUpload}
                  className="text-xs w-full"
                  disabled={isProcessing}
                />
                {referenceMockup && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-green-600">✓ Reference loaded</span>
                    <button
                      onClick={() => setReferenceMockup(null)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <Button
          onClick={(e) => {
            e.preventDefault();
            console.log("[AIChatPanel] Button clicked", { prompt: prompt.trim(), isProcessing, selectedPanelId });
            handleSubmit();
          }}
          disabled={!prompt.trim() || isProcessing || !selectedPanelId || !!validationError}
          variant="outline"
          className="w-full"
          size="sm"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            "Generate Panel Design"
          )}
        </Button>
      </div>

      {isProcessing && (
        <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
          Generating texture... This may take 10-30 seconds.
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <div className="space-y-2 overflow-y-auto flex-1">
            {history
              .slice()
              .reverse()
              .map((item, i) => (
                <div key={i} className="text-xs p-2.5 bg-muted rounded-lg border-2 border-black">
                  <p className="font-medium mb-1">{item.prompt}</p>
                  <p className="text-muted-foreground">{item.response}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
