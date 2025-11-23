"use client";

import { useRef, useState, Suspense, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

interface ModelViewerProps {
  modelUrl?: string;
  error?: string | null;
  lightingMode?: "studio" | "sunset" | "warehouse" | "forest";
  wireframe?: boolean;
  zoomAction?: "in" | "out" | null;
  autoRotate?: boolean;
}

function ModelLoader({
  url,
  wireframe,
  opacity,
  onLoad,
}: {
  url: string;
  wireframe: boolean;
  opacity: number;
  onLoad?: () => void;
}) {
  const { scene } = useGLTF(url);
  const clonedScene = scene.clone();

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            material.wireframe = wireframe;
            material.opacity = opacity;
            material.transparent = opacity < 1;
            material.needsUpdate = true;

            if (wireframe) {
              material.emissive = new THREE.Color("#60a5fa");
              material.emissiveIntensity = 0.2;
              material.color = new THREE.Color("#60a5fa");
            }
          }
        });
      }
    });
  }, [clonedScene, wireframe, opacity]);

  useEffect(() => {
    onLoad?.();
  }, [onLoad]);

  return <primitive object={clonedScene} />;
}

function ModelLoaderWrapper({ url, wireframe }: { url: string; wireframe: boolean }) {
  return (
    <Suspense fallback={null}>
      <ModelLoader url={url} wireframe={wireframe} opacity={1} onLoad={() => {}} />
    </Suspense>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
      <div className="text-center px-8">
        <div className="mb-4">
          <svg
            className="w-16 h-16 text-red-500 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <p className="text-red-400 text-lg font-semibold mb-2">Error</p>
        <p className="text-gray-400 text-sm">{message}</p>
      </div>
    </div>
  );
}

export default function ModelViewer({
  modelUrl,
  error,
  lightingMode = "studio",
  wireframe = false,
  zoomAction,
  autoRotate = true,
}: ModelViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);


  useEffect(() => {
    if (!zoomAction || !controlsRef.current) return;

    const currentDistance = controlsRef.current.getDistance();
    const newDistance = zoomAction === "in" 
      ? Math.max(currentDistance * 0.8, 2) 
      : Math.min(currentDistance * 1.2, 10);

    controlsRef.current.minDistance = newDistance;
    controlsRef.current.maxDistance = newDistance;
    controlsRef.current.update();

    const timer = setTimeout(() => {
      if (controlsRef.current) {
        controlsRef.current.minDistance = 2;
        controlsRef.current.maxDistance = 10;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [zoomAction]);

  // Don't render Canvas until we have a model URL to prevent WebGL context starvation
  if (!modelUrl && !error) {
    return <div className="w-full h-full relative overflow-hidden bg-muted/30" />;
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      <Canvas
        key="product-viewer-canvas"
        camera={{ position: [2, 1.5, 3.5], fov: 50 }}
        gl={{
          toneMapping: 2,
          toneMappingExposure: 2.0,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
          antialias: true,
        }}
        className="w-full h-full"
        frameloop="always"
      >
        <color attach="background" args={["hsl(var(--muted)/0.3)"]} />

        <Suspense fallback={null}>
          <Environment preset={lightingMode} background={false} />
          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 5, 5]} intensity={2.4} castShadow />
          <directionalLight position={[-5, 3, -5]} intensity={0.9} />

          {modelUrl && <ModelLoaderWrapper url={modelUrl} wireframe={wireframe} />}

          <OrbitControls
            ref={controlsRef}
            enableDamping
            dampingFactor={0.05}
            minDistance={2}
            maxDistance={10}
            autoRotate={autoRotate}
            autoRotateSpeed={1.5}
          />
        </Suspense>
      </Canvas>

      {error && <ErrorDisplay message={error} />}
    </div>
  );
}
