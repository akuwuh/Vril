"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Download } from "lucide-react";

export default function FinalView() {
  const [environmentText, setEnvironmentText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!environmentText.trim()) return;
    
    setIsGenerating(true);
    // TODO: Implement Gemini API call to generate image
    // This will take the model's image and feed it to Gemini
    // along with the environment description
    setTimeout(() => {
      setIsGenerating(false);
      // Placeholder for now - will be replaced with actual generated image URL
      setGeneratedImage(null);
    }, 2000);
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview Area */}
        <div className="flex-1 relative bg-muted/30 min-h-0">
          <div className="w-full h-full flex items-center justify-center p-8">
            {generatedImage ? (
              <div className="w-full h-full flex items-center justify-center">
                <img 
                  src={generatedImage} 
                  alt="Generated product in environment" 
                  className="max-w-full max-h-full object-contain rounded-lg border-2 border-black bg-background"
                />
              </div>
            ) : (
              <div className="text-center max-w-md">
                <div className="mb-6">
                  <div className="w-64 h-64 mx-auto bg-muted rounded-lg border-2 border-dashed border-black flex items-center justify-center mb-4">
                    <p className="text-muted-foreground text-sm">
                      {isGenerating ? "Generating..." : "Generated image will appear here"}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter an environment description to generate your product image
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Export Options */}
        <div className="bg-background border-t-2 border-black flex-shrink-0">
          <div className="container mx-auto px-6 py-6 max-w-4xl">
            <h3 className="font-bold text-lg mb-4">Export Options</h3>
            <div className="grid grid-cols-3 gap-4">
              <button className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer">
                <Download className="w-6 h-6 mb-2 transition-transform group-hover:-translate-y-1" />
                <span className="font-bold text-sm">2D Dieline</span>
                <span className="text-xs text-muted-foreground mt-1">PDF, SVG, PNG</span>
              </button>
              <button className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer">
                <Download className="w-6 h-6 mb-2 transition-transform group-hover:-translate-y-1" />
                <span className="font-bold text-sm">3D Model</span>
                <span className="text-xs text-muted-foreground mt-1">OBJ, FBX, GLTF</span>
              </button>
              <button className="flex flex-col items-center justify-center p-4 rounded-lg border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer">
                <Download className="w-6 h-6 mb-2 transition-transform group-hover:-translate-y-1" />
                <span className="font-bold text-sm">Render Images</span>
                <span className="text-xs text-muted-foreground mt-1">High-res PNG</span>
              </button>
            </div>
          </div>
        </div>

        {/* Environment Input */}
        <div className="bg-card flex-shrink-0 border-t-2 border-black">
          <div className="container mx-auto px-6 py-6 max-w-4xl">
            <div className="flex items-center gap-3">
              <Input
                type="text"
                placeholder="Describe the environment (e.g., product on a store shelf in a modern retail store)"
                value={environmentText}
                onChange={(e) => setEnvironmentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && environmentText.trim() && !isGenerating) {
                    handleGenerate();
                  }
                }}
                className="flex-1 h-12 text-base"
                disabled={isGenerating}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
