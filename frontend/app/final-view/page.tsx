"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Download } from "lucide-react";

export default function FinalView() {
  const [environmentText, setEnvironmentText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [objectName, setObjectName] = useState("object");

  // Update object name based on first word of environment text
  useEffect(() => {
    const firstWord = environmentText.trim().split(/\s+/)[0];
    if (firstWord && firstWord.length > 0) {
      setObjectName(firstWord);
    } else {
      setObjectName("object");
    }
  }, [environmentText]);

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

  // Download options for each box
  const leftDownloads = [
    { name: `${objectName}.jpg`, extension: ".jpg" },
    { name: `${objectName}.pdf`, extension: ".pdf" },
    { name: `${objectName}.png`, extension: ".png" },
    { name: `${objectName}.svg`, extension: ".svg" },
  ];

  const rightDownloads = [
    { name: `${objectName}.stl`, extension: ".stl" },
    { name: `${objectName}.obj`, extension: ".obj" },
  ];

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview Area */}
        <div className="flex-1 relative bg-muted/30 min-h-0 flex flex-col">
          {/* Environment Input */}
          <div className="bg-card flex-shrink-0 border-b-2 border-black">
            <div className="container mx-auto px-6 py-4 max-w-7xl">
              <div className="flex items-center gap-3 justify-center">
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
                  className="w-full max-w-2xl h-12 text-base border-2 border-black"
                  disabled={isGenerating}
                />
                <Button
                  onClick={handleGenerate}
                  disabled={!environmentText.trim() || isGenerating}
                  size="icon"
                  className="h-12 w-12 bg-primary text-primary-foreground border-2 border-black hover:bg-primary/90 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="flex-1 w-full p-8 overflow-auto">
            <div className="max-w-7xl mx-auto h-full">
              <div className="grid grid-cols-2 gap-8 h-full">
                {/* Left Column */}
                <div className="flex flex-col gap-4">
                  {/* Image Box */}
                  <div className="flex-1 bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center min-h-[400px]">
                    <p className="text-muted-foreground text-sm">
                      {isGenerating ? "Generating..." : "Generated image 1"}
                    </p>
                  </div>

                  {/* Download Options - Fixed Height */}
                  <div className="h-[250px] bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4">
                    <h3 className="font-bold text-sm mb-3 border-b-2 border-black pb-2">2D Download Options</h3>
                    <div className="space-y-2">
                      {leftDownloads.map((download, idx) => (
                        <button
                          key={idx}
                          className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        >
                          <span className="text-sm font-medium truncate">{download.name}</span>
                          <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-4">
                  {/* Image Box */}
                  <div className="flex-1 bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex items-center justify-center min-h-[400px]">
                    <p className="text-muted-foreground text-sm">
                      {isGenerating ? "Generating..." : "Generated image 2"}
                    </p>
                  </div>

                  {/* Download Options - Fixed Height */}
                  <div className="h-[250px] bg-background rounded-lg border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4">
                    <h3 className="font-bold text-sm mb-3 border-b-2 border-black pb-2">3D Download Options</h3>
                    <div className="space-y-2">
                      {rightDownloads.map((download, idx) => (
                        <button
                          key={idx}
                          className="w-full flex items-center justify-between gap-3 p-2 rounded-md border-2 border-black bg-card hover:bg-accent transition-all duration-200 hover:scale-[1.02] active:scale-95 group cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                        >
                          <span className="text-sm font-medium truncate">{download.name}</span>
                          <Download className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-y-1" />
                        </button>
                      ))}
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
