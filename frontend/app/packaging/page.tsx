"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { DielineEditor } from "@/components/dieline-editor";
import { PackageViewer3D } from "@/components/package-viewer-3d";
import { AIChatPanel } from "@/components/AIChatPanel";
import { CylinderIcon, Box, CheckCircle2 } from "lucide-react";
import { useLoading } from "@/providers/LoadingProvider";
import { getPackagingState, updatePackagingDimensions, getPackagingStatus } from "@/lib/packaging-api";
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
  const [packageModel, setPackageModel] = useState<PackageModel>(() =>
    generatePackageModel("box", DEFAULT_PACKAGE_DIMENSIONS.box)
  );
  const [selectedPanelId, setSelectedPanelId] = useState<PanelId | null>(null);
  const [activeView, setActiveView] = useState<"2d" | "3d">("3d");
  const [panelTextures, setPanelTextures] = useState<Partial<Record<PanelId, string>>>({});
  const [showTextureNotification, setShowTextureNotification] = useState<{ panelId: PanelId; show: boolean } | null>(null);

  /**
   * Hydrate state from backend on mount/reload.
   * This is the key to persistence!
   */
  const hydrateFromBackend = useCallback(async () => {
    try {
      console.log("[Packaging] 🔄 Hydrating state from backend");
      const state = await getPackagingState();
      setPackagingState(state);
      
      // Validate dimensions before using them
      const hasValidDimensions = 
        state.package_dimensions &&
        typeof state.package_dimensions.width === 'number' &&
        typeof state.package_dimensions.height === 'number' &&
        typeof state.package_dimensions.depth === 'number';
      
      const targetType = state.package_type || 'box';
      const targetDimensions = hasValidDimensions
        ? state.package_dimensions as PackageDimensions
        : DEFAULT_PACKAGE_DIMENSIONS[targetType];
      
      console.log("[Packaging] 📦 Restoring type:", targetType, "dimensions:", targetDimensions);
      
      // Update model FIRST, before textures
      const newModel = generatePackageModel(targetType, targetDimensions);
      setPackageModel(newModel);
      
      // Then update type and dimensions
      setPackageType(targetType);
      setDimensions(targetDimensions);
      
      // Finally restore textures (now matching the correct model)
      const cachedTextures: Partial<Record<PanelId, string>> = {};
      for (const [panelId, texture] of Object.entries(state.panel_textures)) {
        // Only load textures for panels that exist in the new model
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
      
      // If backend had empty/invalid dimensions, persist the defaults we're using
      if (!hasValidDimensions) {
        console.log("[Packaging] 💾 Persisting initial defaults to backend");
        await updatePackagingDimensions(targetType, targetDimensions);
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
  
  // Poll for generation completion
  useEffect(() => {
    if (!isGenerating) return;
    
    console.log("[Packaging] 🔄 Starting polling for generation completion");
    const pollInterval = setInterval(async () => {
      try {
        const status = await getPackagingStatus();
        if (!status.in_progress) {
          console.log("[Packaging] ✅ Generation complete, re-hydrating");
          clearInterval(pollInterval);
          await hydrateFromBackend(); // Re-hydrate to get new textures
          setIsGenerating(false);
        }
      } catch (err) {
        console.error("[Packaging] ❌ Polling error:", err);
      }
    }, 2000);
    
    return () => {
      console.log("[Packaging] 🛑 Stopping polling");
      clearInterval(pollInterval);
    };
  }, [isGenerating, hydrateFromBackend]);

  useEffect(() => {
    // Skip if not yet hydrated (hydration handles model generation)
    if (!isHydrated) return;
    
    console.log("[Packaging] 🔄 Regenerating model from dimension/type change");
    const newModel = generatePackageModel(packageType, dimensions);
    setPackageModel(newModel);
    setSelectedPanelId(null);
  }, [packageType, dimensions.width, dimensions.height, dimensions.depth, isHydrated]);
  const handlePackageTypeChange = useCallback(async (type: PackageType) => {
    console.log("[Packaging] 📦 Changing package type to:", type);
    setPackageType(type);
    const newDimensions = DEFAULT_PACKAGE_DIMENSIONS[type];
    setDimensions(newDimensions);
    setSelectedPanelId(null);
    
    // Persist to backend
    try {
      await updatePackagingDimensions(type, newDimensions);
      console.log("[Packaging] ✅ Persisted package type change");
    } catch (err: any) {
      console.error("[Packaging] ❌ Failed to save package type:", err);
      console.error("[Packaging] Error details:", err.message);
      setSaveError(`Failed to save: ${err.message}`);
      setTimeout(() => setSaveError(null), 5000);
    }
  }, []);

  const handleDimensionChange = useCallback(async (key: keyof PackageDimensions, value: number) => {
    const validValue = isNaN(value) || value < 0 ? 0 : value;
    
    setDimensions(prev => {
      const newDimensions = { ...prev, [key]: validValue };
      
      // Persist to backend (fire-and-forget, non-blocking)
      updatePackagingDimensions(packageType, newDimensions).catch(err => {
        console.error("[Packaging] ❌ Failed to save dimensions:", err);
        console.error("[Packaging] Error details:", err.message);
        setSaveError(`Failed to save: ${err.message}`);
        setTimeout(() => setSaveError(null), 5000);
      });
      
      return newDimensions;
    });
  }, [packageType]);

  const handleDielineChange = useCallback((newDielines: typeof packageModel.dielines) => {
    setPackageModel((prev) => updateModelFromDielines(prev, newDielines));
  }, []);

  const handleTextureGenerated = useCallback((panelId: PanelId, textureUrl: string) => {
    console.log("[Packaging] 🎨 Texture generated for:", panelId);
    
    // Optimistic local update
    setPanelTextures((prev) => ({ ...prev, [panelId]: textureUrl }));
    
    setPackageModel((prev) => ({
      ...prev,
      panelStates: {
        ...prev.panelStates,
        [panelId]: {
          ...prev.panelStates[panelId],
          textureUrl,
        },
      },
    }));

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
                />

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
                
                {saveError && (
                  <div className="absolute top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg">
                      {saveError}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="w-[380px] border-l-2 border-black bg-card overflow-hidden flex flex-col shrink-0">
          <div className="border-b-2 border-black shrink-0 px-4 py-3">
            <h2 className="text-sm font-semibold" suppressHydrationWarning>Controls</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4">
            {/* AI Assistant Section */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">AI Assistant</Label>
              <AIChatPanel 
                selectedPanelId={selectedPanelId}
                packageModel={packageModel}
                onTextureGenerated={handleTextureGenerated}
              />
            </div>
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

            {/* Panel Selection */}
            {packageModel.panels.length > 0 && (
              <Card className="p-4 space-y-3">
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
                  <div className="mt-2 p-2 bg-muted rounded text-xs">
                    <p className="font-medium">
                      {packageModel.panels.find((p) => p.id === selectedPanelId)?.name}
                    </p>
                    <p className="text-muted-foreground mt-1">
                      {packageModel.panels.find((p) => p.id === selectedPanelId)?.description}
                    </p>
                  </div>
                )}
              </Card>
            )}

            {/* Dimensions */}
            <Card className="p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Dimensions (mm)</h3>

              {packageType === "box" ? (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">X</Label>
                      <Input
                        type="number"
                        value={packageModel.dimensions.width}
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
                      value={[packageModel.dimensions.width]}
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
                        value={packageModel.dimensions.height}
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
                      value={[packageModel.dimensions.height]}
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
                        value={packageModel.dimensions.depth}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val) && val >= 0) handleDimensionChange("depth", val);
                        }}
                        className="w-16 h-7 text-xs"
                        min={0}
                      />
                    </div>
                    <Slider
                      value={[packageModel.dimensions.depth]}
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
                        value={packageModel.dimensions.width / 2}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val) && val >= 0) handleDimensionChange("width", val * 2);
                        }}
                        className="w-16 h-7 text-xs"
                        min={0}
                      />
                    </div>
                    <Slider
                      value={[packageModel.dimensions.width / 2]}
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
                        value={packageModel.dimensions.height}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val) && val >= 0) handleDimensionChange("height", val);
                        }}
                        className="w-16 h-7 text-xs"
                        min={0}
                      />
                    </div>
                    <Slider
                      value={[packageModel.dimensions.height]}
                      onValueChange={([value]) => handleDimensionChange("height", value)}
                      min={20}
                      max={400}
                      step={5}
                      className="w-full"
                    />
                  </div>
                </>
              ) : null}
            </Card>

            {/* Dieline Info */}
            <Card className="p-4 space-y-2 bg-muted/50">
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
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}

export default Packaging;
