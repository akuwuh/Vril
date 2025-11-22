"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { LayoutRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { useContext } from "react";
import { TransitionPathnameContext } from "@/context/TransitionPathnameContext";

// This component freezes the context for the exit animation
function FrozenRoute({ children }: { children: React.ReactNode }) {
  const context = useContext(LayoutRouterContext);
  const frozen = useRef(context).current;

  return (
    <LayoutRouterContext.Provider value={frozen}>
      {children}
    </LayoutRouterContext.Provider>
  );
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="h-full w-full flex-1 flex flex-col overflow-hidden"
      >
        <FrozenRoute>
          <TransitionPathnameContext.Provider value={pathname}>
            {children}
          </TransitionPathnameContext.Provider>
        </FrozenRoute>
      </motion.div>
    </AnimatePresence>
  );
}

