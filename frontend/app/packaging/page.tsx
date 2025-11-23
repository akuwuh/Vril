"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { DielineEditor } from "@/components/dieline-editor";
import { PackageViewer3D } from "@/components/package-viewer-3d";
import { AIChatPanel } from "@/components/AIChatPanel";
import { CylinderIcon, Box } from "lucide-react";
import {
  type PackageType,
  type PackageDimensions,
  DEFAULT_PACKAGE_DIMENSIONS,
  generatePackageModel,
  updateModelFromDielines,
  type PackageModel,
  type PanelId,
} from "@/lib/packaging-types";

export default function Packaging() {
  const [selectedColor, setSelectedColor] = useState("#60a5fa");

  // Advanced packaging state - using PackageModel
  const [packageType, setPackageTypeState] = useState<PackageType>("box");
  const [dimensions, setDimensionsState] = useState<PackageDimensions>(DEFAULT_PACKAGE_DIMENSIONS.box);
  const [packageModel, setPackageModel] = useState<PackageModel>(() =>
    generatePackageModel("box", DEFAULT_PACKAGE_DIMENSIONS.box)
  );
  const [selectedPanelId, setSelectedPanelId] = useState<PanelId | null>(null);
  const [activeView, setActiveView] = useState<"2d" | "3d">("3d");
  const [panelTextures, setPanelTextures] = useState<Record<PanelId, string>>({});

  // Update model when package type or dimensions change
  useEffect(() => {
    const newModel = generatePackageModel(packageType, dimensions);
    setPackageModel(newModel);
    setSelectedPanelId(null); // Reset selection when model changes
  }, [packageType, dimensions.width, dimensions.height, dimensions.depth]);


  const packageTypes: { type: PackageType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { type: "box", label: "Box", icon: Box },
    { type: "cylinder", label: "Cylinder", icon: CylinderIcon },
  ];

  const handlePackageTypeChange = (type: PackageType) => {
    setPackageTypeState(type);
    setDimensionsState(DEFAULT_PACKAGE_DIMENSIONS[type]);
    setSelectedPanelId(null);
  };

  const handleDimensionChange = (key: keyof PackageDimensions, value: number) => {
    const validValue = isNaN(value) || value < 0 ? 0 : value;
    setDimensionsState((prev) => ({
      ...prev,
      [key]: validValue,
    }));
  };

  const handleDielineChange = (newDielines: typeof packageModel.dielines) => {
    // Update model from dieline changes - this connects dieline and 3D state
    const updatedModel = updateModelFromDielines(packageModel, newDielines);
    setPackageModel(updatedModel);
  };

  const handlePanelSelect = (panelId: PanelId | null) => {
    setSelectedPanelId(panelId);
  };

  const handleTextureGenerated = (panelId: PanelId, textureUrl: string) => {
    setPanelTextures((prev) => ({
      ...prev,
      [panelId]: textureUrl,
    }));
    // Update panel state in model
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
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="flex-1 flex overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Canvas Area */}
          <div className="flex-1 overflow-hidden">
            {activeView === "2d" ? (
              <DielineEditor
                dielines={packageModel.dielines}
                panels={packageModel.panels}
                selectedPanelId={selectedPanelId}
                onDielineChange={handleDielineChange}
                onPanelSelect={handlePanelSelect}
                editable={true}
              />
            ) : (
              <div className="h-full bg-muted/30 relative">
                <PackageViewer3D
                  model={packageModel}
                  selectedPanelId={selectedPanelId}
                  onPanelSelect={handlePanelSelect}
                  color={selectedColor}
                  panelTextures={panelTextures}
                />

              </div>
            )}
          </div>
        </div>

        <div className="w-[380px] border-l-2 border-black bg-card overflow-hidden flex flex-col flex-shrink-0">
          <div className="border-b-2 border-black flex-shrink-0 px-4 py-3">
            <h2 className="text-sm font-semibold">
              Controls
            </h2>
          </div>

          {/* Chat Section - Pinned to Top */}
          <div className="border-b border-border p-4 flex-shrink-0 bg-muted/10">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">AI Assistant</h3>
            <AIChatPanel 
              selectedPanelId={selectedPanelId}
              packageModel={packageModel}
              onTextureGenerated={handleTextureGenerated}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col space-y-4">
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
                {packageTypes.map(({ type, label, icon: Icon }) => (
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
                      className="text-xs relative"
                      size="sm"
                      onClick={() => handlePanelSelect(panel.id === selectedPanelId ? null : panel.id)}
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
                  {/* X (Width) - Only edits width */}
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

                  {/* Y (Height) - Only edits height */}
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

                  {/* Z (Depth) - Only edits depth, does NOT affect X (width) or Y (height) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Z</Label>
                      <Input
                        type="number"
                        value={packageModel.dimensions.depth}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val) && val >= 0) {
                            // Only update depth, X (width) and Y (height) remain unchanged
                            handleDimensionChange("depth", val);
                          }
                        }}
                        className="w-16 h-7 text-xs"
                        min={0}
                      />
                    </div>
                    <Slider
                      value={[packageModel.dimensions.depth]}
                      onValueChange={([value]) => {
                        // Only update depth, X (width) and Y (height) remain unchanged
                        handleDimensionChange("depth", value);
                      }}
                      min={20}
                      max={300}
                      step={5}
                      className="w-full"
                    />
                  </div>
                </>
              ) : packageType === "cylinder" ? (
                <>
                  {/* Radius - Only edits radius (stored as width/diameter) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Radius</Label>
                      <Input
                        type="number"
                        value={packageModel.dimensions.width / 2}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val) && val >= 0) {
                            // Only update width (diameter = 2 * radius), height and depth remain unchanged
                            handleDimensionChange("width", val * 2);
                          }
                        }}
                        className="w-16 h-7 text-xs"
                        min={0}
                      />
                    </div>
                    <Slider
                      value={[packageModel.dimensions.width / 2]}
                      onValueChange={([value]) => {
                        // Only update width (diameter = 2 * radius), height remains unchanged
                        handleDimensionChange("width", value * 2);
                      }}
                      min={10}
                      max={150}
                      step={5}
                      className="w-full"
                    />
                  </div>

                  {/* Height - Only edits height */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Height</Label>
                      <Input
                        type="number"
                        value={packageModel.dimensions.height}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (!isNaN(val) && val >= 0) {
                            // Only update height, radius (width) remains unchanged
                            handleDimensionChange("height", val);
                          }
                        }}
                        className="w-16 h-7 text-xs"
                        min={0}
                      />
                    </div>
                    <Slider
                      value={[packageModel.dimensions.height]}
                      onValueChange={([value]) => {
                        // Only update height, radius (width) remains unchanged
                        handleDimensionChange("height", value);
                      }}
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
                  <span className="font-medium text-foreground">
                    {packageType === "box"
                      ? Math.round(
                          2 *
                            (dimensions.width * dimensions.height +
                              dimensions.width * dimensions.depth +
                              dimensions.height * dimensions.depth),
                        )
                      : Math.round(
                          Math.PI * dimensions.width * dimensions.height +
                            2 * Math.PI * (dimensions.width / 2) ** 2,
                        )}{" "}
                    mm²
                  </span>
                </div>
              </div>
            </Card>

            {/* Quick Actions */}
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start bg-transparent" size="sm">
                Reset to Default
              </Button>
              <Button variant="outline" className="w-full justify-start bg-transparent" size="sm">
                Import Custom Dieline
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
