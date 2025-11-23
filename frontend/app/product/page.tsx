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
import { getProductState } from "@/lib/product-api";
import { ProductState } from "@/lib/product-types";
import { getCachedModelUrl, clearCachedModel } from "@/lib/model-cache";

export default function ProductPage() {
  const { stopLoading } = useLoading();
  const [productState, setProductState] = useState<ProductState | null>(null);
  const [currentModelUrl, setCurrentModelUrl] = useState<string>();
  const latestIterationIdRef = useRef<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pendingRevokeRef = useRef<string[]>([]);
  const [selectedColor, setSelectedColor] = useState("#60a5fa");
  const [selectedTexture, setSelectedTexture] = useState("matte");
  const [lightingMode, setLightingMode] = useState<"studio" | "sunset" | "warehouse" | "forest">("studio");
  const [displayMode, setDisplayMode] = useState<"solid" | "wireframe">("solid");
  const [zoomAction, setZoomAction] = useState<"in" | "out" | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isEditInProgress, setIsEditInProgress] = useState(false);

  const applyModelUrl = useCallback((url?: string, iterationId?: string) => {
    if (!url) {
      return;
    }
    if (
      objectUrlRef.current &&
      objectUrlRef.current !== url &&
      objectUrlRef.current.startsWith("blob:")
    ) {
      pendingRevokeRef.current.push(objectUrlRef.current);
    }
    objectUrlRef.current = url.startsWith("blob:") ? url : null;
    setCurrentModelUrl(url);
    if (iterationId) {
      latestIterationIdRef.current = iterationId;
    }
  }, []);

  const handleViewerModelLoaded = useCallback((loadedUrl: string) => {
    // Revoke old blobs only after new model loads successfully
    if (pendingRevokeRef.current.length > 0) {
      pendingRevokeRef.current.forEach((blobUrl) => {
        if (blobUrl.startsWith("blob:") && blobUrl !== loadedUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      });
      pendingRevokeRef.current = [];
    }
  }, []);

  const hydrateProductState = useCallback(async () => {
    try {
      const state = await getProductState();
      setProductState(state);
      const latestIteration = state.iterations.at(-1);
      const remoteModelUrl = state.trellis_output?.model_file;
      if (latestIteration && remoteModelUrl) {
        const iterationId = latestIteration.created_at;
        // Skip if we already have this exact iteration cached as a blob
        if (
          latestIterationIdRef.current === iterationId &&
          objectUrlRef.current?.startsWith("blob:")
        ) {
          return;
        }
        try {
          const cachedUrl = await getCachedModelUrl(iterationId, remoteModelUrl);
          applyModelUrl(cachedUrl, iterationId);
        } catch (cacheError) {
          console.error("Model cache fetch failed, using remote URL:", cacheError);
          applyModelUrl(remoteModelUrl, iterationId);
        }
      }
    } catch (error) {
      console.error("Failed to load product state:", error);
    }
  }, [applyModelUrl]);

  useEffect(() => {
    let isMounted = true;
    hydrateProductState().finally(() => {
      if (isMounted) {
        stopLoading();
      }
    });
    return () => {
      isMounted = false;
      if (objectUrlRef.current && objectUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      pendingRevokeRef.current.forEach((blobUrl) => {
        if (blobUrl.startsWith("blob:")) {
          URL.revokeObjectURL(blobUrl);
        }
      });
      pendingRevokeRef.current = [];
    };
  }, [hydrateProductState, stopLoading]);

  // Reset zoom action after it's been processed
  useEffect(() => {
    if (zoomAction) {
      const timer = setTimeout(() => setZoomAction(null), 200);
      return () => clearTimeout(timer);
    }
  }, [zoomAction]);

  const colors = [
    { name: "Blue", value: "#60a5fa" },
    { name: "White", value: "#ffffff" },
    { name: "Black", value: "#000000" },
    { name: "Red", value: "#ef4444" },
    { name: "Green", value: "#22c55e" },
    { name: "Yellow", value: "#eab308" },
  ];

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden relative">
      <div className="flex-1 flex overflow-hidden">
        {/* 3D Viewer */}
        <div className="flex-1 relative bg-muted/30">
          <ModelViewer
            modelUrl={currentModelUrl}
            onModelLoaded={handleViewerModelLoaded}
            selectedColor={selectedColor}
            selectedTexture={selectedTexture}
            lightingMode={lightingMode}
            wireframe={displayMode === "wireframe"}
            zoomAction={zoomAction}
            autoRotate={autoRotate}
          />

          {/* Floating Controls */}
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
