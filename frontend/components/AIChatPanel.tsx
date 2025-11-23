"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RotateCcw } from "lucide-react";
import { editProduct, getProductStatus, rewindProduct } from "@/lib/product-api";
import { ProductState, ProductStatus } from "@/lib/product-types";

interface AIChatPanelProps {
  productState: ProductState | null;
  isEditInProgress: boolean;
  onEditStart: () => void;
  onEditComplete: () => Promise<void> | void;
  onEditError: () => void;
}

export function AIChatPanel({
  productState,
  isEditInProgress,
  onEditStart,
  onEditComplete,
  onEditError,
}: AIChatPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [editStatus, setEditStatus] = useState<ProductStatus | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [rewindTarget, setRewindTarget] = useState<number | null>(null);

  const suggestions = [
    "Make the model taller",
    "Change the color to blue",
    "Add more details",
    "Rotate the model 90 degrees",
    "Make it smaller",
    "Add lighting effects",
  ];

  // Avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Poll backend status while edit is running
  useEffect(() => {
    if (!isEditInProgress) {
      setEditStatus(null);
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const status = await getProductStatus();
        if (isCancelled) {
          return;
        }
        setEditStatus(status);

        if (status.status === "complete") {
          await onEditComplete();
          return;
        }

        if (status.status === "error") {
          onEditError();
          return;
        }
      } catch (error) {
        console.error("Failed to poll product status:", error);
      }

      if (!isCancelled) {
        timeoutId = setTimeout(poll, 3000);
      }
    };

    poll();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isEditInProgress, onEditComplete, onEditError]);

  const iterations = useMemo(() => productState?.iterations ?? [], [productState?.iterations]);
  const canEdit = Boolean(productState?.images?.length);

  const handleSubmit = async () => {
    if (!prompt.trim() || !canEdit) return;

    try {
      onEditStart();
      await editProduct(prompt.trim());
      setPrompt("");
    } catch (error) {
      console.error("Edit failed:", error);
      onEditError();
    }
  };

  const handleRewind = async (iterationIndex: number) => {
    try {
      setRewindTarget(iterationIndex);
      await rewindProduct(iterationIndex);
      await onEditComplete();
    } catch (error) {
      console.error("Rewind failed:", error);
      onEditError();
    } finally {
      setRewindTarget(null);
    }
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col">
      {!canEdit && (
        <div className="text-xs p-3 border-2 border-dashed border-muted-foreground rounded-lg text-muted-foreground">
          Generate a base product first to unlock editing.
        </div>
      )}

      {isEditInProgress && editStatus && (
        <div className="p-3 bg-blue-50 border-2 border-blue-500 rounded-lg text-xs space-y-2">
          <div className="flex items-center gap-2 font-medium text-blue-900">
            <Loader2 className="w-4 h-4 animate-spin" />
            {editStatus.message || "Processing edit..."}
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(editStatus.progress || 0, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Textarea
          placeholder={canEdit ? "Describe changes..." : "Generate a base product first"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[80px] resize-none text-sm"
          disabled={isEditInProgress || !canEdit}
        />
        <Button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isEditInProgress || !canEdit}
          variant="outline"
          className="w-full"
          size="sm"
        >
          {isEditInProgress ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            "Apply Changes"
          )}
        </Button>
      </div>

      {isMounted && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setPrompt(suggestion)}
                disabled={isEditInProgress || !canEdit}
                className="text-xs px-2.5 py-1.5 bg-secondary text-secondary-foreground rounded-full border-2 border-black hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {iterations.length > 0 && (
        <div className="space-y-2 flex-1 flex flex-col min-h-0">
          <div className="text-xs font-semibold text-muted-foreground">History</div>
          <div className="space-y-2 overflow-y-auto flex-1">
            {iterations
              .slice()
              .reverse()
              .map((iteration, idx) => {
                const actualIndex = iterations.length - 1 - idx;
                const isCurrent = actualIndex === iterations.length - 1;

                return (
                  <div
                    key={`${iteration.created_at}-${actualIndex}`}
                    className={`text-xs p-2.5 rounded-lg border-2 ${
                      isCurrent ? "bg-primary/10 border-primary" : "bg-muted border-black"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium line-clamp-2">{iteration.prompt}</p>
                        <p className="text-muted-foreground text-[10px] mt-1">
                          {iteration.type} • {new Date(iteration.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      {!isCurrent && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 border border-black rounded-full"
                          disabled={isEditInProgress || rewindTarget === actualIndex}
                          onClick={() => handleRewind(actualIndex)}
                          title="Rewind to this version"
                        >
                          {rewindTarget === actualIndex ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

