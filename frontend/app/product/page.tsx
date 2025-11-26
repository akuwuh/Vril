"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ZoomIn, ZoomOut, Play, Pause, Settings, Sun, Warehouse, Eye, EyeOff, Download } from "lucide-react";
import ModelViewer, { ModelViewerRef } from "@/components/ModelViewer";
import { AIChatPanel } from "@/components/AIChatPanel";
import { useLoading } from "@/providers/LoadingProvider";
import { getProductState, recoverProductState } from "@/lib/product-api";
import { ProductState } from "@/lib/product-types";
import { getCachedModelUrl } from "@/lib/model-cache";

function ProductPage() {
  const { stopLoading } = useLoading();
  const [productState, setProductState] = useState<ProductState | null>(null);
  const [currentModelUrl, setCurrentModelUrl] = useState<string>();
  const [modelKey, setModelKey] = useState<string>("");
  const [lightingMode, setLightingMode] = useState<"studio" | "sunset" | "warehouse" | "forest">("studio");
  const [displayMode, setDisplayMode] = useState<"solid" | "wireframe">("solid");
  const [zoomAction, setZoomAction] = useState<"in" | "out" | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isEditInProgress, setIsEditInProgress] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  
  const latestIterationIdRef = useRef<string | null>(null);
  const viewerRef = useRef<ModelViewerRef>(null);

  const previewImage =
    productState?.trellis_output?.no_background_images?.[0] ??
    productState?.images?.[0] ??
    null;

  const applyModelUrl = useCallback((url?: string, iterationId?: string) => {
    if (!url) return;
    console.log(`[ProductPage] 🔄 Applying new model: ${iterationId}`);
    setCurrentModelUrl(url);
    if (iterationId) {
      latestIterationIdRef.current = iterationId;
      setModelKey(iterationId); // Force clean remount with new key
    }
  }, []);

  const hydrateProductState = useCallback(async () => {
    try {
      const state = await getProductState();
      const latestIteration = state.iterations.at(-1);
      const iterationId = latestIteration?.id;
      const remoteModelUrl = state.trellis_output?.model_file;
      
      console.log("[ProductPage] 🔍 Hydrating state:", {
        in_progress: state.in_progress,
        has_model: !!remoteModelUrl,
        iteration_id: iterationId,
        current_loaded: latestIterationIdRef.current
      });
      
      // Always update product state
        setProductState(state);
      
      // Check if state shows in_progress - if so, resume polling
      if (state.in_progress) {
        console.log("[ProductPage] 🔄 Generation in progress - resuming polling");
        setIsEditInProgress(true);
        // Still try to load previous model if we don't have one loaded
        if (!currentModelUrl && remoteModelUrl && iterationId) {
          console.log("[ProductPage] 📦 Loading previous model during generation");
          try {
            const cachedUrl = await getCachedModelUrl(iterationId, remoteModelUrl);
            applyModelUrl(cachedUrl, iterationId);
          } catch (cacheError) {
            console.error("Model cache failed:", cacheError);
            applyModelUrl(remoteModelUrl, iterationId);
          }
        }
        return;
      }
      
      // Check if this is a new iteration - if so, ALWAYS reload even if we have a model
      const isNewIteration = iterationId && latestIterationIdRef.current !== iterationId;
      const alreadyLoaded = iterationId && latestIterationIdRef.current === iterationId && currentModelUrl;
      
      console.log("[ProductPage] 🔍 Model loading decision:", {
        iterationId,
        currentIteration: latestIterationIdRef.current,
        isNewIteration,
        alreadyLoaded,
        hasCurrentModel: !!currentModelUrl
      });
      
      // Only skip if we already have this exact iteration loaded
      if (alreadyLoaded && !isNewIteration) {
        console.log("[ProductPage] ♻️ Same iteration already loaded, skipping");
        return;
      }
      
      // Load the model (new iteration or first load)
      if (remoteModelUrl && iterationId) {
        console.log("[ProductPage] 📦 Loading model:", { iterationId, isNewIteration, url: remoteModelUrl.substring(0, 50) });
        try {
          const cachedUrl = await getCachedModelUrl(iterationId, remoteModelUrl);
          console.log("[ProductPage] ✅ Cached URL retrieved, applying model");
          applyModelUrl(cachedUrl, iterationId);
        } catch (cacheError) {
          console.error("Model cache failed:", cacheError);
          console.log("[ProductPage] ⚠️ Falling back to direct URL");
          applyModelUrl(remoteModelUrl, iterationId);
        }
      } else {
        console.log("[ProductPage] ⚠️ No model to load:", { remoteModelUrl, iterationId });
      }
    } catch (error) {
      console.error("Failed to load product state:", error);
    }
  }, [applyModelUrl, currentModelUrl]);

  useEffect(() => {
    // On mount, just hydrate - don't call recovery as it breaks ongoing generations
    hydrateProductState().finally(() => stopLoading());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!zoomAction) return;
    const timer = setTimeout(() => setZoomAction(null), 200);
    return () => clearTimeout(timer);
  }, [zoomAction]);

  const handleDownloadScreenshot = useCallback(async () => {
    if (!viewerRef.current || isDownloading || !currentModelUrl) return;
    
    try {
      setIsDownloading(true);
      
      // Temporarily disable auto-rotate
      const wasAutoRotating = autoRotate;
      setAutoRotate(false);
      
      // Wait a bit for the rotation to stop
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Capture screenshot
      const dataUrl = await viewerRef.current.captureScreenshot();
      
      // Create download link
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `product-${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Restore auto-rotate
      if (wasAutoRotating) {
        setAutoRotate(true);
      }
    } catch (error) {
      console.error("Failed to capture screenshot:", error);
      alert("Failed to capture screenshot. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }, [autoRotate, currentModelUrl, isDownloading]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-muted/30">
          <ModelViewer
            ref={viewerRef}
            key={modelKey}
            modelUrl={currentModelUrl}
            lightingMode={lightingMode}
            wireframe={displayMode === "wireframe"}
            zoomAction={zoomAction}
            autoRotate={autoRotate}
          />

          {previewImage && (
            <div className="absolute bottom-4 left-4 w-48 border-4 border-black bg-card shadow-[4px_4px_0_rgba(0,0,0,0.5)]">
              <div className="text-[10px] font-mono uppercase px-3 py-1 border-b-2 border-black bg-black text-white">
                Latest Render
              </div>
              <div className="aspect-square overflow-hidden bg-muted">
                <img
                  src={previewImage}
                  alt="Latest generated preview"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          <div className="absolute top-4 right-4 flex flex-col gap-2">
            <Button 
              size="icon" 
              variant="secondary" 
              onClick={handleDownloadScreenshot}
              disabled={isDownloading || !currentModelUrl}
              title="Download Screenshot"
            >
              {isDownloading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Download className="w-4 h-4" />
              )}
            </Button>
            <Button size="icon" variant="secondary" onClick={() => setZoomAction("in")}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="secondary" onClick={() => setZoomAction("out")}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="secondary" onClick={() => setAutoRotate(!autoRotate)}>
              {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="secondary">
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setLightingMode("studio")}>
                  <Settings className="w-4 h-4 mr-2" />
                  Studio Lighting
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLightingMode("sunset")}>
                  <Sun className="w-4 h-4 mr-2" />
                  Sunset Lighting
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLightingMode("warehouse")}>
                  <Warehouse className="w-4 h-4 mr-2" />
                  Warehouse Lighting
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setDisplayMode("solid")}>
                  <Eye className="w-4 h-4 mr-2" />
                  Solid View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setDisplayMode("wireframe")}>
                  <EyeOff className="w-4 h-4 mr-2" />
                  Wireframe View
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="w-[380px] border-l-2 border-black bg-card overflow-hidden flex flex-col shrink-0">
          <div className="border-b-2 border-black shrink-0 px-4 py-3">
            <h2 className="text-sm font-semibold">
              Chat
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <AIChatPanel
              productState={productState}
              isEditInProgress={isEditInProgress}
              onEditStart={() => setIsEditInProgress(true)}
              onEditComplete={async () => {
                await hydrateProductState();
                setIsEditInProgress(false);
              }}
              onEditError={() => setIsEditInProgress(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductPage;
