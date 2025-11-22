"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export function AIChatPanel() {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Array<{ prompt: string; response: string }>>([]);
  const [isMounted, setIsMounted] = useState(false);

  const suggestions = [
    "Make the model taller",
    "Change the color to blue",
    "Add more details",
    "Rotate the model 90 degrees",
    "Make it smaller",
    "Add lighting effects"
  ];

  // Only render suggestions after component mounts to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim()) return;

    setIsProcessing(true);

    // Simulate AI processing
    setTimeout(() => {
      setHistory([
        ...history,
        {
          prompt,
          response: `Applied changes: "${prompt}". The 3D model has been updated accordingly.`,
        },
      ]);
      setPrompt("");
      setIsProcessing(false);
    }, 2000);
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      {/* Prompt Input */}
      <div className="space-y-2">
        <Textarea
          placeholder="Describe changes..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[80px] resize-none text-sm"
          disabled={isProcessing}
        />
        <Button onClick={handleSubmit} disabled={!prompt.trim() || isProcessing} variant="outline" className="w-full" size="sm">
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            "Apply Changes"
          )}
        </Button>
      </div>

      {/* Suggestions */}
      {isMounted && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setPrompt(suggestion)}
                disabled={isProcessing}
                className="text-xs px-2.5 py-1.5 bg-secondary text-secondary-foreground rounded-full border-2 border-black hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <div className="space-y-2 overflow-y-auto flex-1">
            {history
              .slice()
              .reverse()
              .map((item, i) => (
                <div key={i} className="text-xs p-2.5 bg-muted rounded-lg border-2 border-black">
                  <p className="font-medium">{item.prompt}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

