"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import LoadingOverlay from "@/components/LoadingOverlay";

interface LoadingContextType {
  startLoading: () => void;
  stopLoading: () => void;
  isLoading: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const startLoading = useCallback(() => {
    setIsVisible(true);
    setIsExiting(false);
  }, []);

  const stopLoading = useCallback(() => {
    setIsExiting(true);
    setIsVisible(false);
    
    // Reset after animation duration
    setTimeout(() => {
      setIsExiting(false);
    }, 800); // 700ms duration + buffer
  }, []);

  return (
    <LoadingContext.Provider value={{ startLoading, stopLoading, isLoading: isVisible || isExiting }}>
      <LoadingOverlay isVisible={isVisible} isExiting={isExiting} />
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
}





