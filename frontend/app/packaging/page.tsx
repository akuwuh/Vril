"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DielineEditor } from "@/components/dieline-editor";
import { PackageViewer3D } from "@/components/package-viewer-3d";
import { AIChatPanel } from "@/components/AIChatPanel";
import { CylinderIcon, Box, CheckCircle2, MessageSquare, Pencil } from "lucide-react";

// Separate component for the editor panel to reduce main component re-renders
const PackagingEditor = React.memo(function PackagingEditor({
  activeView,
  setActiveView,
  packageType,
  handlePackageTypeChange,
  dimensions,
  handleDimensionChange,
  packageModel,
  surfaceArea,
  volume,
  packagingState,
}: {
  activeView: "2d" | "3d";
  setActiveView: (view: "2d" | "3d") => void;
  packageType: PackageType;
  handlePackageTypeChange: (type: PackageType) => Promise<void>;
  dimensions: PackageDimensions;
  handleDimensionChange: (key: keyof PackageDimensions, value: number) => void;
  packageModel: PackageModel | null;
  surfaceArea: number;
  volume: number;
  packagingState: PackagingState | null;
}) {
  return (
    <TabsContent value="editor" className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4 mt-0">
      {/* View Toggle Buttons */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">View Mode</Label>
        <div className="flex gap-2">
          <Button
            variant={activeView === "2d" ? "default" : "outline"}
            className="flex-1"
            size="sm"
            onClick={() => setActiveView("2d")}
          >
            Dieline
          </Button>
          <Button
            variant={activeView === "3d" ? "default" : "outline"}
            className="flex-1"
            size="sm"
            onClick={() => setActiveView("3d")}
          >
            3D
          </Button>
        </div>
      </div>

      {/* Package Type Selection */}
      <div className="space-y-3">
        <Label className="text-xs font-medium text-muted-foreground">Package Type</Label>
        <div className="grid grid-cols-2 gap-2">
          {PACKAGE_TYPES.map(({ type, label, icon: Icon }) => (
            <Button
              key={type}
              variant={packageType === type ? "default" : "outline"}
              className="flex flex-col items-center gap-1 h-auto py-3"
              size="sm"
              onClick={() => handlePackageTypeChange(type)}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Dimensions */}
      <div className="border-2 border-black p-4 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Dimensions (mm)</h3>

        {packageType === "box" ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">X</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.width ?? dimensions.width}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      handleDimensionChange("width", val);
                    }
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.width ?? dimensions.width]}
                onValueChange={([value]) => handleDimensionChange("width", value)}
                min={20}
                max={300}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Y</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.height ?? dimensions.height}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) {
                      handleDimensionChange("height", val);
                    }
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.height ?? dimensions.height]}
                onValueChange={([value]) => handleDimensionChange("height", value)}
                min={20}
                max={400}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Z</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.depth ?? dimensions.depth}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) handleDimensionChange("depth", val);
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.depth ?? dimensions.depth]}
                onValueChange={([value]) => handleDimensionChange("depth", value)}
                min={20}
                max={300}
                step={5}
                className="w-full"
              />
            </div>
          </>
        ) : packageType === "cylinder" ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Radius</Label>
                <Input
                  type="number"
                  value={(packageModel?.dimensions.width ?? dimensions.width) / 2}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) handleDimensionChange("width", val * 2);
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[(packageModel?.dimensions.width ?? dimensions.width) / 2]}
                onValueChange={([value]) => handleDimensionChange("width", value * 2)}
                min={10}
                max={150}
                step={5}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Height</Label>
                <Input
                  type="number"
                  value={packageModel?.dimensions.height ?? dimensions.height}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!isNaN(val) && val >= 0) handleDimensionChange("height", val);
                  }}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
              </div>
              <Slider
                value={[packageModel?.dimensions.height ?? dimensions.height]}
                onValueChange={([value]) => handleDimensionChange("height", value)}
                min={20}
                max={400}
                step={5}
                className="w-full"
              />
            </div>
          </>
        ) : null}
      </div>

      {/* Package Info */}
      <div className="border-2 border-black p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Package Information</h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between text-muted-foreground">
            <span>Volume:</span>
            <span className="font-medium text-foreground">{volume} mm³</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Surface Area:</span>
            <span className="font-medium text-foreground">{surfaceArea} mm²</span>
          </div>
        </div>
      </div>
    </TabsContent>
  );
});
import { useLoading } from "@/providers/LoadingProvider";
import { updatePackagingDimensions, getPackagingState, getPackagingStatus } from "@/lib/packaging-api";
import { getCachedTextureUrl } from "@/lib/texture-cache";
import {
  type PackageType,
  type PackageDimensions,
  type PackagingState,
  DEFAULT_PACKAGE_DIMENSIONS,
  generatePackageModel,
  updateModelFromDielines,
  type PackageModel,
  type PanelId,
  type DielinePath,
} from "@/lib/packaging-types";

const PACKAGE_TYPES: readonly { type: PackageType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "box", label: "Box", icon: Box },
  { type: "cylinder", label: "Cylinder", icon: CylinderIcon },
] as const;

function Packaging() {
  const { stopLoading } = useLoading();
  const [packagingState, setPackagingState] = useState<PackagingState | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  
  const [packageType, setPackageType] = useState<PackageType>("box");
  const [dimensions, setDimensions] = useState<PackageDimensions>(DEFAULT_PACKAGE_DIMENSIONS.box);
  const [packageModel, setPackageModel] = useState<PackageModel | null>(null); // Start with null until hydrated
  const [selectedPanelId, setSelectedPanelId] = useState<PanelId | null>(null);
  const [activeView, setActiveView] = useState<"2d" | "3d">("3d");
  const [panelTextures, setPanelTextures] = useState<Partial<Record<PanelId, string>>>({});
  const [showTextureNotification, setShowTextureNotification] = useState<{ panelId: PanelId; show: boolean } | null>(null);
  const [lightingMode, setLightingMode] = useState<"studio" | "sunset" | "warehouse" | "forest">("studio");
  const [displayMode, setDisplayMode] = useState<"solid" | "wireframe">("solid");
  const [zoomAction, setZoomAction] = useState<"in" | "out" | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  /**
   * Hydrate state from backend on mount/reload.
   * Loads the saved state for the current shape type.
   */
  const hydrateFromBackend = useCallback(async () => {
    try {
      console.log("[Packaging] 🔄 Hydrating state from backend");
      const state = await getPackagingState();
      setPackagingState(state);
      
      const targetType = state.current_package_type || 'box';
      const shapeState = targetType === 'cylinder' ? state.cylinder_state : state.box_state;
      
      // Use dimensions from the shape's state - backend guarantees valid dimensions
      const targetDimensions = shapeState?.dimensions as PackageDimensions;
      
      console.log("[Packaging] 📦 Restoring type:", targetType);
      console.log("[Packaging] 📏 Restored dimensions:", targetDimensions);
      console.log("[Packaging] 🎨 Restored textures:", Object.keys(shapeState?.panel_textures || {}));
      console.log("[Packaging] 📊 Full state - Box dims:", state.box_state?.dimensions, "Cylinder dims:", state.cylinder_state?.dimensions);
      
      // Generate model for current shape type
      const newModel = generatePackageModel(targetType, targetDimensions);
      setPackageModel(newModel);
      
      // Update type and dimensions
      setPackageType(targetType);
      setDimensions(targetDimensions);
      
      // Restore textures for current shape type
      const cachedTextures: Partial<Record<PanelId, string>> = {};
      for (const [panelId, texture] of Object.entries(shapeState.panel_textures || {})) {
        if (newModel.panels.some(p => p.id === panelId)) {
          try {
            const cachedUrl = await getCachedTextureUrl(panelId, texture.texture_url);
            cachedTextures[panelId as PanelId] = cachedUrl;
          } catch (err) {
            console.error(`[Packaging] ❌ Failed to load texture for ${panelId}:`, err);
          }
        }
      }
      
      if (Object.keys(cachedTextures).length > 0) {
        console.log("[Packaging] 🎨 Restored textures:", Object.keys(cachedTextures));
        setPanelTextures(cachedTextures);
      }
      
      // Check if generation is in progress
      if (state.in_progress || state.bulk_generation_in_progress) {
        console.log("[Packaging] ⏳ Generation in progress, resuming polling");
        setIsGenerating(true);
      }
      
      setIsHydrated(true);
    } catch (error) {
      console.error("[Packaging] ❌ Failed to hydrate packaging state:", error);
      // On error, use defaults
      const defaultModel = generatePackageModel('box', DEFAULT_PACKAGE_DIMENSIONS.box);
      setPackageModel(defaultModel);
      setPackageType('box');
      setDimensions(DEFAULT_PACKAGE_DIMENSIONS.box);
      setIsHydrated(true);
    }
  }, []);
  
  // Hydrate on mount ONLY (not on every render)
  useEffect(() => {
    hydrateFromBackend().finally(() => stopLoading());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array = mount only
  
  // Poll for generation completion with exponential backoff
  useEffect(() => {
    if (!isGenerating) return;

    console.log("[Packaging] 🔄 Starting polling for generation completion");
    let pollCount = 0;
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      try {
        const status = await getPackagingStatus();
        if (!status.in_progress) {
          console.log("[Packaging] ✅ Generation complete, re-hydrating");
          await hydrateFromBackend(); // Re-hydrate to get new textures
          setIsGenerating(false);
          return;
        }

        // Continue polling with exponential backoff
        pollCount++;
        // Start at 2s, increase to max 10s, with jitter
        const baseDelay = Math.min(2000 * Math.pow(1.5, pollCount - 1), 10000);
        const jitter = Math.random() * 1000; // Add up to 1s jitter
        const delay = baseDelay + jitter;

        console.log(`[Packaging] 🔄 Still generating... next poll in ${Math.round(delay/1000)}s (attempt ${pollCount})`);
        timeoutId = setTimeout(poll, delay);

      } catch (err) {
        console.error("[Packaging] ❌ Polling error:", err);
        // On error, retry with shorter delay
        timeoutId = setTimeout(poll, 5000);
      }
    };

    // Start first poll immediately
    poll();

    return () => {
      console.log("[Packaging] 🛑 Stopping polling");
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isGenerating, hydrateFromBackend]);

  useEffect(() => {
    // Skip if not yet hydrated (hydration handles model generation)
    if (!isHydrated) return;
    
    console.log("[Packaging] 🔄 Regenerating model from dimension/type change");
    const newModel = generatePackageModel(packageType, dimensions);
    setPackageModel(newModel);
    setSelectedPanelId(null);
  }, [packageType, dimensions.width, dimensions.height, dimensions.depth]);
  
  const handlePackageTypeChange = useCallback(async (type: PackageType) => {
    if (!packagingState) return;
    
    console.log("[Packaging] 📦 Switching from", packageType, "to", type);
    
    // Get the saved state for the target shape type - use ONLY saved state
    const targetState = type === 'cylinder' ? packagingState.cylinder_state : packagingState.box_state;
    const targetDimensions = targetState?.dimensions as PackageDimensions;
    
    console.log("[Packaging] 🔄 Loading saved state for", type);
    console.log("[Packaging] 📏 Dimensions:", targetDimensions);
    console.log("[Packaging] 🎨 Textures:", Object.keys(targetState?.panel_textures || {}));
    
    // Generate model for target shape with its saved dimensions
    const newModel = generatePackageModel(type, targetDimensions);
    setPackageModel(newModel);
    
    // Update local state
    setPackageType(type);
    setDimensions(targetDimensions);
    setSelectedPanelId(null);
    
    // Load textures for target shape
    const cachedTextures: Partial<Record<PanelId, string>> = {};
    for (const [panelId, texture] of Object.entries(targetState.panel_textures || {})) {
      if (newModel.panels.some(p => p.id === panelId)) {
        try {
          const cachedUrl = await getCachedTextureUrl(panelId, texture.texture_url);
          cachedTextures[panelId as PanelId] = cachedUrl;
        } catch (err) {
          console.error(`[Packaging] ❌ Failed to load texture for ${panelId}:`, err);
        }
      }
    }
    setPanelTextures(cachedTextures);
    console.log("[Packaging] ✅ Loaded", Object.keys(cachedTextures).length, "cached textures");
    
    // Persist type switch to backend
    try {
      await updatePackagingDimensions(type, targetDimensions);
      console.log("[Packaging] ✅ Backend updated: type =", type, ", dims =", targetDimensions);
    } catch (err: unknown) {
      console.error("[Packaging] ❌ Failed to save package type:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Packaging] Error details:", errorMessage);
      setSaveError(`Failed to save: ${errorMessage}`);
      setTimeout(() => setSaveError(null), 5000);
    }
  }, [packagingState, packageType]);

  // Debounced dimension saving
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingDimensionsRef = useRef<PackageDimensions | null>(null);

  const saveDimensionsDebounced = useCallback(async (type: PackageType, dims: PackageDimensions) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    pendingDimensionsRef.current = dims;

    saveTimeoutRef.current = setTimeout(async () => {
      if (pendingDimensionsRef.current) {
        try {
          await updatePackagingDimensions(type, pendingDimensionsRef.current);
          console.log("[Packaging] ✅ Debounced dimensions saved");
        } catch (err: unknown) {
          console.error("[Packaging] ❌ Failed to save dimensions:", err);
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error("[Packaging] Error details:", errorMessage);
          setSaveError(`Failed to save: ${errorMessage}`);
          setTimeout(() => setSaveError(null), 5000);
        }
        pendingDimensionsRef.current = null;
      }
    }, 1000); // 1 second debounce
  }, []);

  const handleDimensionChange = useCallback((key: keyof PackageDimensions, value: number) => {
    const validValue = isNaN(value) || value < 0 ? 0 : value;

    setDimensions(prev => {
      const newDimensions = { ...prev, [key]: validValue };
      // Update local packaging state to keep it in sync
      setPackagingState(prevState => {
        if (!prevState) return prevState;
        
        const updatedState = { ...prevState };
        if (packageType === 'cylinder') {
          updatedState.cylinder_state = {
            ...prevState.cylinder_state,
            dimensions: newDimensions
          };
        } else {
          updatedState.box_state = {
            ...prevState.box_state,
            dimensions: newDimensions
          };
        }
        return updatedState;
      });

      // Debounced save to backend
      saveDimensionsDebounced(packageType, newDimensions);
      return newDimensions;
    });
  }, [packageType, saveDimensionsDebounced]);

  const handleDielineChange = useCallback((newDielines: DielinePath[]) => {
    setPackageModel((prev) => {
      if (!prev) return prev;
      return updateModelFromDielines(prev, newDielines);
    });
  }, []);

  const handleTextureGenerated = useCallback((panelId: PanelId, textureUrl: string) => {
    console.log("[Packaging] 🎨 Texture generated for:", panelId);
    
    // Optimistic local update
    setPanelTextures((prev) => ({ ...prev, [panelId]: textureUrl }));
    
    setPackageModel((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        panelStates: {
          ...prev.panelStates,
          [panelId]: {
            ...prev.panelStates[panelId],
            textureUrl,
          },
        },
      };
    });
    
    // Update local packaging state to keep textures in sync
    // Backend already saved the texture, we just update local state for shape switching
    // Note: We'll re-hydrate from backend after generation completes to get full state

    // Backend already saved the texture, just show notification
    setShowTextureNotification({ panelId, show: true });
    setTimeout(() => setShowTextureNotification(null), 3000);
  }, []);

  const surfaceArea = useMemo(() => {
    const { width, height, depth } = dimensions;
    return packageType === "box"
      ? Math.round(2 * (width * height + width * depth + height * depth))
      : Math.round(Math.PI * width * height + 2 * Math.PI * (width / 2) ** 2);
  }, [packageType, dimensions]);

  const volume = useMemo(() => {
    const { width, height, depth } = dimensions;
    return packageType === "box"
      ? Math.round(width * height * depth)
      : Math.round(Math.PI * (width / 2) ** 2 * height);
  }, [packageType, dimensions]);

  // Show loading state until hydrated
  if (!isHydrated || !packageModel) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading packaging state...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            {activeView === "2d" ? (
              <DielineEditor
                dielines={packageModel.dielines}
                panels={packageModel.panels}
                selectedPanelId={selectedPanelId}
                onDielineChange={handleDielineChange}
                onPanelSelect={setSelectedPanelId}
                editable={true}
              />
            ) : (
              <div className="h-full bg-muted/30 relative">
                <PackageViewer3D
                  model={packageModel}
                  selectedPanelId={selectedPanelId}
                  onPanelSelect={setSelectedPanelId}
                  color="#60a5fa"
                  panelTextures={panelTextures}
                  lightingMode={lightingMode}
                  wireframe={displayMode === "wireframe"}
                  zoomAction={zoomAction}
                  autoRotate={autoRotate}
                />

                {isGenerating && packagingState && (
                  <div className="absolute top-4 left-4 z-40 bg-black/80 text-white px-4 py-3 rounded-lg shadow-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <div>
                        <p className="text-sm font-semibold">Generating Textures</p>
                        {packagingState.generating_panel && (
                          <p className="text-xs opacity-80">Current: {packagingState.generating_panel}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {showTextureNotification?.show && (
                  <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 border-2 border-green-700">
                      <CheckCircle2 className="w-5 h-5" />
                      <div>
                        <p className="font-semibold">Texture Applied! 🎨</p>
                        <p className="text-sm opacity-90">
                          {packageModel.panels.find(p => p.id === showTextureNotification.panelId)?.name} panel updated
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-[380px] border-l-2 border-black bg-card overflow-hidden flex flex-col shrink-0">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col">
            <div className="border-b-2 border-black shrink-0 px-4 py-3">
              <TabsList className="w-full grid grid-cols-2 gap-2 bg-transparent p-0 h-auto">
                <TabsTrigger value="chat" className="gap-2 border-2 border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:bg-background shadow-none">
                  <MessageSquare className="w-4 h-4" />
                  Chat
                </TabsTrigger>
                <TabsTrigger value="editor" className="gap-2 border-2 border-black data-[state=active]:bg-black data-[state=active]:text-white data-[state=inactive]:bg-background shadow-none">
                  <Pencil className="w-4 h-4" />
                  Editor
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Chat Tab */}
            <TabsContent value="chat" className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4 mt-0">
              {/* AI Chat */}
              <AIChatPanel 
                selectedPanelId={selectedPanelId}
                packageModel={packageModel}
                onTextureGenerated={handleTextureGenerated}
                packagingState={packagingState}
                isGenerating={isGenerating}
              />

              {/* Panel Selection */}
              {packageModel.panels.length > 0 && (
                <div className="border-2 border-black p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Select Panel</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {packageModel.panels.map((panel) => (
                      <Button
                        key={panel.id}
                        variant={selectedPanelId === panel.id ? "default" : "outline"}
                        className="text-xs"
                        size="sm"
                        onClick={() => setSelectedPanelId(panel.id === selectedPanelId ? null : panel.id)}
                      >
                        {panel.name}
                        {panelTextures[panel.id] && (
                          <span className="ml-1 text-[10px]">✨</span>
                        )}
                      </Button>
                    ))}
                  </div>
                  {selectedPanelId && (
                    <div className="mt-2 p-2 border-2 border-black text-xs">
                      <p className="font-medium">
                        {packageModel.panels.find((p) => p.id === selectedPanelId)?.name}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {packageModel.panels.find((p) => p.id === selectedPanelId)?.description}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Editor Tab */}
            <PackagingEditor
              activeView={activeView}
              setActiveView={setActiveView}
              packageType={packageType}
              handlePackageTypeChange={handlePackageTypeChange}
              dimensions={dimensions}
              handleDimensionChange={handleDimensionChange}
              packageModel={packageModel}
              surfaceArea={surfaceArea}
              volume={volume}
              packagingState={packagingState}
            />
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default Packaging;
