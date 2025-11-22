"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Upload, Sparkles, RotateCw, Download, ZoomIn, ZoomOut, Play, Pause, Settings, Sun, Warehouse, Eye, EyeOff } from "lucide-react";
import ModelViewer from "@/components/ModelViewer";
import { AIChatPanel } from "@/components/AIChatPanel";

export default function Home() {
  const [currentModelUrl, setCurrentModelUrl] = useState<string>();
  const [selectedColor, setSelectedColor] = useState("#60a5fa");
  const [selectedTexture, setSelectedTexture] = useState("matte");
  const [lightingMode, setLightingMode] = useState<"studio" | "sunset" | "warehouse" | "forest">("studio");
  const [displayMode, setDisplayMode] = useState<"solid" | "wireframe">("solid");
  const [zoomAction, setZoomAction] = useState<"in" | "out" | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

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
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-border flex-shrink-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-semibold">3D Model Viewer</h1>
              <p className="text-sm text-muted-foreground">Interactive 3D Model Display</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 3D Viewer */}
        <div className="flex-1 relative bg-muted/30">
          <ModelViewer
            modelUrl={currentModelUrl}
            onModelLoaded={setCurrentModelUrl}
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

        <div className="w-[380px] border-l border-border bg-card overflow-hidden flex flex-col flex-shrink-0">
          <div className="border-b border-border flex-shrink-0 px-4 py-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Chat
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <AIChatPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
