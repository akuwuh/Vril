"use client";

import { createContext, useContext } from "react";
import { usePathname as useNextPathname } from "next/navigation";

const TransitionPathnameContext = createContext<string | null>(null);

export function useTransitionPathname() {
  const transitionPathname = useContext(TransitionPathnameContext);
  const nextPathname = useNextPathname();
  return transitionPathname ?? nextPathname;
}

export { TransitionPathnameContext };





