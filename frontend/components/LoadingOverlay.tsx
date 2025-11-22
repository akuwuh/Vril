"use client";

import React from "react";

interface LoadingOverlayProps {
  isVisible: boolean;
  isExiting?: boolean; // If true, slides up. If false, slides down (enter) or stays (if visible).
}

export default function LoadingOverlay({ isVisible, isExiting = false }: LoadingOverlayProps) {
  if (!isVisible && !isExiting) return null;

  return (
    <div
      className={`
        fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background
        transition-transform duration-700 cubic-bezier(0.68, -0.55, 0.27, 1.55)
        ${!isVisible && !isExiting ? "hidden" : ""}
        ${isExiting 
          ? "-translate-y-full" 
          : "translate-y-0 animate-in slide-in-from-top duration-700 fill-mode-forwards delay-100"
        }
      `}
    >
      <div className="flex flex-col items-center justify-center w-full h-full space-y-8">
        <div className="relative flex items-center justify-center flex-col gap-8">
          <div className="banter-loader">
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
            <div className="banter-loader__box"></div>
          </div>
          <span className="text-foreground font-medium tracking-widest text-sm animate-pulse">
            GENERATING...
          </span>
          <style jsx>{`
            .banter-loader {
              position: relative;
              width: 72px;
              height: 72px;
              margin-bottom: 2rem;
            }

            .banter-loader__box {
              float: left;
              position: relative;
              width: 20px;
              height: 20px;
              margin-right: 6px;
            }

            .banter-loader__box:before {
              content: "";
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              height: 100%;
              background: var(--foreground);
            }

            .banter-loader__box:nth-child(3n) {
              margin-right: 0;
              margin-bottom: 6px;
            }

            .banter-loader__box:nth-child(1):before,
            .banter-loader__box:nth-child(4):before {
              margin-left: 26px;
            }

            .banter-loader__box:nth-child(3):before {
              margin-top: 52px;
            }

            .banter-loader__box:last-child {
              margin-bottom: 0;
            }

            @keyframes moveBox-1 {
              9.09% { transform: translate(-26px, 0); }
              18.18% { transform: translate(0px, 0); }
              27.27% { transform: translate(0px, 0); }
              36.36% { transform: translate(26px, 0); }
              45.45% { transform: translate(26px, 26px); }
              54.54% { transform: translate(26px, 26px); }
              63.63% { transform: translate(26px, 26px); }
              72.72% { transform: translate(26px, 0px); }
              81.81% { transform: translate(0px, 0px); }
              90.90% { transform: translate(-26px, 0px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(1) { animation: moveBox-1 4s infinite; }

            @keyframes moveBox-2 {
              9.09% { transform: translate(0, 0); }
              18.18% { transform: translate(26px, 0); }
              27.27% { transform: translate(0px, 0); }
              36.36% { transform: translate(26px, 0); }
              45.45% { transform: translate(26px, 26px); }
              54.54% { transform: translate(26px, 26px); }
              63.63% { transform: translate(26px, 26px); }
              72.72% { transform: translate(26px, 26px); }
              81.81% { transform: translate(0px, 26px); }
              90.90% { transform: translate(0px, 26px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(2) { animation: moveBox-2 4s infinite; }

            @keyframes moveBox-3 {
              9.09% { transform: translate(-26px, 0); }
              18.18% { transform: translate(-26px, 0); }
              27.27% { transform: translate(0px, 0); }
              36.36% { transform: translate(-26px, 0); }
              45.45% { transform: translate(-26px, 0); }
              54.54% { transform: translate(-26px, 0); }
              63.63% { transform: translate(-26px, 0); }
              72.72% { transform: translate(-26px, 0); }
              81.81% { transform: translate(-26px, -26px); }
              90.90% { transform: translate(0px, -26px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(3) { animation: moveBox-3 4s infinite; }

            @keyframes moveBox-4 {
              9.09% { transform: translate(-26px, 0); }
              18.18% { transform: translate(-26px, 0); }
              27.27% { transform: translate(-26px, -26px); }
              36.36% { transform: translate(0px, -26px); }
              45.45% { transform: translate(0px, 0px); }
              54.54% { transform: translate(0px, -26px); }
              63.63% { transform: translate(0px, -26px); }
              72.72% { transform: translate(0px, -26px); }
              81.81% { transform: translate(-26px, -26px); }
              90.90% { transform: translate(-26px, 0px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(4) { animation: moveBox-4 4s infinite; }

            @keyframes moveBox-5 {
              9.09% { transform: translate(0, 0); }
              18.18% { transform: translate(0, 0); }
              27.27% { transform: translate(0, 0); }
              36.36% { transform: translate(26px, 0); }
              45.45% { transform: translate(26px, 0); }
              54.54% { transform: translate(26px, 0); }
              63.63% { transform: translate(26px, 0); }
              72.72% { transform: translate(26px, 0); }
              81.81% { transform: translate(26px, -26px); }
              90.90% { transform: translate(0px, -26px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(5) { animation: moveBox-5 4s infinite; }

            @keyframes moveBox-6 {
              9.09% { transform: translate(0, 0); }
              18.18% { transform: translate(-26px, 0); }
              27.27% { transform: translate(-26px, 0); }
              36.36% { transform: translate(0px, 0); }
              45.45% { transform: translate(0px, 0); }
              54.54% { transform: translate(0px, 0); }
              63.63% { transform: translate(0px, 0); }
              72.72% { transform: translate(0px, 26px); }
              81.81% { transform: translate(-26px, 26px); }
              90.90% { transform: translate(-26px, 0px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(6) { animation: moveBox-6 4s infinite; }

            @keyframes moveBox-7 {
              9.09% { transform: translate(26px, 0); }
              18.18% { transform: translate(26px, 0); }
              27.27% { transform: translate(26px, 0); }
              36.36% { transform: translate(0px, 0); }
              45.45% { transform: translate(0px, -26px); }
              54.54% { transform: translate(26px, -26px); }
              63.63% { transform: translate(0px, -26px); }
              72.72% { transform: translate(0px, -26px); }
              81.81% { transform: translate(0px, 0px); }
              90.90% { transform: translate(26px, 0px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(7) { animation: moveBox-7 4s infinite; }

            @keyframes moveBox-8 {
              9.09% { transform: translate(0, 0); }
              18.18% { transform: translate(-26px, 0); }
              27.27% { transform: translate(-26px, -26px); }
              36.36% { transform: translate(0px, -26px); }
              45.45% { transform: translate(0px, -26px); }
              54.54% { transform: translate(0px, -26px); }
              63.63% { transform: translate(0px, -26px); }
              72.72% { transform: translate(0px, -26px); }
              81.81% { transform: translate(26px, -26px); }
              90.90% { transform: translate(26px, 0px); }
              100% { transform: translate(0px, 0px); }
            }

            .banter-loader__box:nth-child(8) { animation: moveBox-8 4s infinite; }

            @keyframes moveBox-9 {
              9.09% { transform: translate(-26px, 0); }
              18.18% { transform: translate(-26px, 0); }
              27.27% { transform: translate(0px, 0); }
              36.36% { transform: translate(-26px, 0); }
              45.45% { transform: translate(0px, 0); }
              54.54% { transform: translate(0px, 0); }
              63.63% { transform: translate(-26px, 0); }
              72.72% { transform: translate(-26px, 0); }
              81.81% { transform: translate(-52px, 0); }
              90.90% { transform: translate(-26px, 0); }
              100% { transform: translate(0px, 0); }
            }

            .banter-loader__box:nth-child(9) { animation: moveBox-9 4s infinite; }
          `}</style>
        </div>
      </div>
    </div>
  );
}

