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
import { ZoomIn, ZoomOut, Play, Pause, Settings, Sun, Warehouse, Eye, EyeOff } from "lucide-react";
import ModelViewer from "@/components/ModelViewer";
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
  
  const latestIterationIdRef = useRef<string | null>(null);

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
      
      // Only skip model loading if we already have this exact iteration AND a model URL loaded
      if (iterationId && latestIterationIdRef.current === iterationId && currentModelUrl) {
        console.log("[ProductPage] ♻️ Same iteration, skipping model reload");
        setProductState(state);
        return;
      }
      
      setProductState(state);
      
      if (latestIteration && remoteModelUrl && iterationId) {
        try {
          const cachedUrl = await getCachedModelUrl(iterationId, remoteModelUrl);
          applyModelUrl(cachedUrl, iterationId);
        } catch (cacheError) {
          console.error("Model cache failed:", cacheError);
          applyModelUrl(remoteModelUrl, iterationId);
        }
      }
      
      // Check if state shows in_progress - if so, resume polling
      if (state.in_progress) {
        console.log("[ProductPage] 🔄 Detected in-progress generation on mount, resuming...");
        setIsEditInProgress(true);
      }
    } catch (error) {
      console.error("Failed to load product state:", error);
    }
  }, [applyModelUrl, currentModelUrl]);

  useEffect(() => {
    // On mount, first try to recover any stale states, then hydrate
    const initialize = async () => {
      try {
        const recovery = await recoverProductState();
        if (recovery.recovered) {
          console.log("[ProductPage] ✅ Recovered from stale state:", recovery.message);
        }
      } catch (error) {
        console.error("[ProductPage] Failed to recover state:", error);
      }
      
      await hydrateProductState();
    };
    
    initialize().finally(() => stopLoading());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!zoomAction) return;
    const timer = setTimeout(() => setZoomAction(null), 200);
    return () => clearTimeout(timer);
  }, [zoomAction]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 relative bg-muted/30">
          <ModelViewer
            key={modelKey}
            modelUrl={currentModelUrl}
            lightingMode={lightingMode}
            wireframe={displayMode === "wireframe"}
            zoomAction={zoomAction}
            autoRotate={autoRotate}
          />

          <div className="absolute top-4 right-4 flex flex-col gap-2">
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
