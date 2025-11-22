"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";

export function AIChatPanel() {
  const [prompt, setPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Array<{ prompt: string; response: string }>>([]);

  const suggestions = [
    "Make the model taller",
    "Change the color to blue",
    "Add more details",
    "Rotate the model 90 degrees",
    "Make it smaller",
    "Add lighting effects"
  ];

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
      <div>
        <h3 className="font-semibold text-sm mb-2">AI Assistant</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Describe changes in natural language. The AI will modify your 3D model design accordingly.
        </p>
      </div>

      {/* Prompt Input */}
      <div className="space-y-2">
        <Textarea
          placeholder={`e.g., "${suggestions[0]}"`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[80px] resize-none text-sm"
          disabled={isProcessing}
        />
        <Button onClick={handleSubmit} disabled={!prompt.trim() || isProcessing} className="w-full" size="sm">
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Apply Changes
            </>
          )}
        </Button>
      </div>

      {/* Suggestions */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Quick suggestions:</p>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => setPrompt(suggestion)}
              disabled={isProcessing}
              className="text-xs px-2.5 py-1.5 bg-secondary text-secondary-foreground rounded-full hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <p className="text-xs font-medium text-muted-foreground">Recent changes:</p>
          <div className="space-y-2 overflow-y-auto flex-1">
            {history
              .slice()
              .reverse()
              .map((item, i) => (
                <div key={i} className="text-xs p-2.5 bg-muted rounded-lg space-y-1">
                  <p className="font-medium">You: {item.prompt}</p>
                  <p className="text-muted-foreground">{item.response}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
