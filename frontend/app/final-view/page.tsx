"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Download, Loader2 } from "lucide-react";
import ModelViewer, { ModelViewerRef } from "@/components/ModelViewer";
import { PackageViewer3D, PackageViewer3DRef } from "@/components/package-viewer-3d";
import { getProductState, downloadProductExport } from "@/lib/product-api";
import { getPackagingState, downloadPackageExport, downloadDielineExport } from "@/lib/packaging-api";
import { getCachedModelUrl } from "@/lib/model-cache";
import { getCachedTextureUrl } from "@/lib/texture-cache";
import { generatePackageModel, PanelId, PackageDimensions } from "@/lib/packaging-types";

export default function FinalView() {
  // State for 3D viewers
  const [productState, setProductState] = useState<any>(null);
  const [productModelUrl, setProductModelUrl] = useState<string>("");
  const [packagingState, setPackagingState] = useState<any>(null);
  const [packageModel, setPackageModel] = useState<any>(null);
  const [panelTextures, setPanelTextures] = useState<Partial<Record<PanelId, string>>>({});
  const [productLoading, setProductLoading] = useState(true);
  const [packagingLoading, setPackagingLoading] = useState(true);
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  
  // Refs for screenshot capture
  const productViewerRef = useRef<ModelViewerRef>(null);
  const packageViewerRef = useRef<PackageViewer3DRef>(null);

  // Download options for each section
  const productDownloads = useMemo(() => [
    { name: "product.blend", format: "blend" as const },
    { name: "product.stl", format: "stl" as const },
    { name: "product.jpg", format: "jpg" as const },
  ], []);

  const packageDownloads = useMemo(() => [
    { name: "package.blend", format: "blend" as const },
    { name: "package.stl", format: "stl" as const },
    { name: "package.jpg", format: "jpg" as const },
  ], []);

  const dielineDownloads = useMemo(() => [
    { name: "dieline.pdf", format: "pdf" as const },
  ], []);

  const handleDownload = async (type: "product" | "package" | "dieline", format: string) => {
    const key = `${type}-${format}`;
    if (downloading[key]) return;

    try {
      setDownloading((prev) => ({ ...prev, [key]: true }));
      
      let blob: Blob | null = null;
      let filename: string;

      // Use screenshot capture for JPG exports
      if (format === "jpg") {
        if (type === "product" && productViewerRef.current) {
          const dataUrl = await productViewerRef.current.captureScreenshot();
          const response = await fetch(dataUrl);
          blob = await response.blob();
          filename = `product.jpg`;
        } else if (type === "package" && packageViewerRef.current) {
          const dataUrl = await packageViewerRef.current.captureScreenshot();
          const response = await fetch(dataUrl);
          blob = await response.blob();
          filename = `package.jpg`;
        } else {
          throw new Error("Viewer not available for screenshot");
        }
      } else {
        // Use backend export for other formats
        if (type === "product") {
          blob = await downloadProductExport(format as "blend" | "stl" | "jpg");
          filename = `product.${format === "blend" ? "obj" : format}`;
        } else if (type === "package") {
          blob = await downloadPackageExport(format as "blend" | "stl" | "jpg");
          filename = `package.${format === "blend" ? "obj" : format}`;
        } else {
          blob = await downloadDielineExport(format as "pdf");
          filename = `dieline.${format}`;
        }
      }

      if (!blob) {
        throw new Error("Failed to generate file");
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(`Failed to download ${type} ${format}:`, error);
      alert(`Failed to download ${type} ${format}. Please try again.`);
    } finally {
      setDownloading((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Load product state and model URL
  useEffect(() => {
    const loadProductState = async () => {
      try {
        setProductLoading(true);
        const state = await getProductState();
        setProductState(state);

        if (state.trellis_output?.model_file) {
          const cachedUrl = await getCachedModelUrl("latest", state.trellis_output.model_file);
          setProductModelUrl(cachedUrl);
        }
      } catch (error) {
        console.error("Failed to load product state:", error);
      } finally {
        setProductLoading(false);
      }
    };

    loadProductState();
  }, []);

  // Load packaging state and generate model with textures
  useEffect(() => {
    const loadPackagingState = async () => {
      try {
        setPackagingLoading(true);
        const state = await getPackagingState();
        setPackagingState(state);

        // Generate package model from state
        const targetType = state.current_package_type || 'box';
        const shapeState = targetType === 'cylinder' ? state.cylinder_state : state.box_state;
        const targetDimensions = shapeState?.dimensions as PackageDimensions;

        const model = generatePackageModel(targetType, targetDimensions);
        setPackageModel(model);

        // Load cached textures for all panels in current shape type
        const textures: Partial<Record<PanelId, string>> = {};
        for (const [panelId, panelTexture] of Object.entries(shapeState?.panel_textures || {})) {
          if (panelTexture.texture_url && model.panels.some(p => p.id === panelId)) {
            try {
              const cachedUrl = await getCachedTextureUrl(panelId, panelTexture.texture_url);
              textures[panelId as PanelId] = cachedUrl;
            } catch (error) {
              console.error(`Failed to load texture for ${panelId}:`, error);
            }
          }
        }
        setPanelTextures(textures);
      } catch (error) {
        console.error("Failed to load packaging state:", error);
      } finally {
        setPackagingLoading(false);
      }
    };

    loadPackagingState();
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview Area */}
        <div className="flex-1 relative bg-muted/30 min-h-0 flex flex-col">
          {/* Two Column Layout */}
          <div className="flex-1 w-full p-8 overflow-auto pb-32">
            <div className="max-w-5xl mx-auto h-full">
              <div className="grid grid-cols-2 gap-8 h-full">
                {/* Left Column */}
                <div className="flex flex-col gap-4">
                  {/* Product Model Viewer */}
                  <div className="flex-1 bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden min-h-[400px]">
                    {productLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">Loading product...</p>
                      </div>
                    ) : productModelUrl ? (
                      <ModelViewer
                        ref={productViewerRef}
                        modelUrl={productModelUrl}
                        autoRotate={true}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">No product model available</p>
                      </div>
                    )}
                  </div>

                  {/* Download Options */}
                  <div className="bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] px-4 pt-4 pb-4 mb-8">
                    <h3 className="font-bold text-sm mb-3 border-b-2 border-black pb-2">Product</h3>
                    <div className="space-y-2 mb-8">
                      {productDownloads.map((download) => {
                        const key = `product-${download.format}`;
                        const isDownloading = downloading[key];
                        return (
                          <button
                            key={download.format}
                            onClick={() => handleDownload("product", download.format)}
                            disabled={isDownloading || !productState?.trellis_output?.model_file}
                            className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <span className="text-sm font-medium truncate">{download.name}</span>
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-4">
                  {/* Package Model Viewer */}
                  <div className="flex-1 bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden min-h-[400px]">
                    {packagingLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">Loading package...</p>
                      </div>
                    ) : packageModel ? (
                      <PackageViewer3D
                        ref={packageViewerRef}
                        model={packageModel}
                        panelTextures={panelTextures}
                        autoRotate={true}
                        hideDielineHud={true}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">No package model available</p>
                      </div>
                    )}
                  </div>

                  {/* Download Options */}
                  <div className="bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] px-4 pt-4 pb-4 mb-8">
                    <h3 className="font-bold text-sm mb-3 border-b-2 border-black pb-2">Package</h3>
                    <div className="space-y-2 mb-4">
                      {packageDownloads.map((download) => {
                        const key = `package-${download.format}`;
                        const isDownloading = downloading[key];
                        return (
                          <button
                            key={download.format}
                            onClick={() => handleDownload("package", download.format)}
                            disabled={isDownloading || !packageModel}
                            className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <span className="text-sm font-medium truncate">{download.name}</span>
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <h3 className="font-bold text-sm mb-3 mt-4 border-b-2 border-black pb-2">Dieline</h3>
                    <div className="space-y-2">
                      {dielineDownloads.map((download) => {
                        const key = `dieline-${download.format}`;
                        const isDownloading = downloading[key];
                        return (
                          <button
                            key={download.format}
                            onClick={() => handleDownload("dieline", download.format)}
                            disabled={isDownloading || !packageModel}
                            className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                          >
                            <span className="text-sm font-medium truncate">{download.name}</span>
                            {isDownloading ? (
                              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
