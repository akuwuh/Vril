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
import {
  type PackageType,
  type PackageDimensions,
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
  const [packageType, setPackageType] = useState<PackageType>("box");
  const [dimensions, setDimensions] = useState<PackageDimensions>(DEFAULT_PACKAGE_DIMENSIONS.box);
  const [packageModel, setPackageModel] = useState<PackageModel>(() =>
    generatePackageModel("box", DEFAULT_PACKAGE_DIMENSIONS.box)
  );
  const [selectedPanelId, setSelectedPanelId] = useState<PanelId | null>(null);
  const [activeView, setActiveView] = useState<"2d" | "3d">("3d");
  const [panelTextures, setPanelTextures] = useState<Partial<Record<PanelId, string>>>({});
  const [showTextureNotification, setShowTextureNotification] = useState<{ panelId: PanelId; show: boolean } | null>(null);

  useEffect(() => {
    const newModel = generatePackageModel(packageType, dimensions);
    setPackageModel(newModel);
    setSelectedPanelId(null);
  }, [packageType, dimensions.width, dimensions.height, dimensions.depth]);
  const handlePackageTypeChange = useCallback((type: PackageType) => {
    setPackageType(type);
    setDimensions(DEFAULT_PACKAGE_DIMENSIONS[type]);
    setSelectedPanelId(null);
  }, []);

  const handleDimensionChange = useCallback((key: keyof PackageDimensions, value: number) => {
    const validValue = isNaN(value) || value < 0 ? 0 : value;
    setDimensions((prev) => ({ ...prev, [key]: validValue }));
  }, []);

  const handleDielineChange = useCallback((newDielines: typeof packageModel.dielines) => {
    setPackageModel((prev) => updateModelFromDielines(prev, newDielines));
  }, []);

  const handleTextureGenerated = useCallback((panelId: PanelId, textureUrl: string) => {
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

    setShowTextureNotification({ panelId, show: true });
    setTimeout(() => setShowTextureNotification(null), 3000);
  }, []);

  const surfaceArea = useMemo(() => {
    const { width, height, depth } = dimensions;
    return packageType === "box"
      ? Math.round(2 * (width * height + width * depth + height * depth))
      : Math.round(Math.PI * width * height + 2 * Math.PI * (width / 2) ** 2);
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
                  2D Dieline Editor
                </Button>
                <Button
                  variant={activeView === "3d" ? "default" : "outline"}
                  className="flex-1"
                  size="sm"
                  onClick={() => setActiveView("3d")}
                >
                  3D Preview
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
                  <span>Total Panels:</span>
                  <span className="font-medium text-foreground">{packageModel.panels.length}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Dieline Paths:</span>
                  <span className="font-medium text-foreground">{packageModel.dielines.length}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Total Points:</span>
                  <span className="font-medium text-foreground">
                    {packageModel.dielines.reduce((sum, path) => sum + path.points.length, 0)}
                  </span>
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
