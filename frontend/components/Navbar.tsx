"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Boxes, Box, Package, Image as ImageIcon, Download } from "lucide-react";

const NAV_ITEMS = [
  {
    path: "/product",
    label: "Product",
    icon: Box,
  },
  {
    path: "/packaging",
    label: "Packaging",
    icon: Package,
  },
  {
    path: "/final-view",
    label: "Final View",
    icon: ImageIcon,
  },
];

export function Navbar() {
  const pathname = usePathname();
  
  // Check if the current path is one of the main flow pages
  const isFlowPage = NAV_ITEMS.some(item => item.path === pathname);

  return (
    <header className="border-b-2 border-black flex-shrink-0 bg-background">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/product">
            <Boxes className="w-12 h-12" />
          </Link>
        </div>
        
        {isFlowPage && (
          <div className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.path;
              const Icon = item.icon;

              if (isActive) {
                return (
                  <Button
                    key={item.path}
                    variant="outline"
                    size="sm"
                    className="pointer-events-none"
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </Button>
                );
              }

              return (
                <Link key={item.path} href={item.path}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 transition-all duration-300 hover:scale-110 hover:bg-accent active:scale-95"
                  >
                    <Icon className="w-4 h-4 transition-transform duration-300" />
                  </Button>
                </Link>
              );
            })}
            
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 transition-all duration-300 hover:scale-110 hover:bg-accent active:scale-95"
            >
              <Download className="w-4 h-4 transition-transform duration-300" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

