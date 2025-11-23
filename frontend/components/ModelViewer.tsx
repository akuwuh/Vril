"use client";

import { useRef, useState, Suspense, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

interface ModelViewerProps {
  modelUrl?: string;
  isLoading?: boolean;
  error?: string | null;
  selectedColor?: string;
  selectedTexture?: string;
  lightingMode?: "studio" | "sunset" | "warehouse" | "forest";
  wireframe?: boolean;
  zoomAction?: "in" | "out" | null;
  autoRotate?: boolean;
}

function CubeModel({
  wireframe,
  showColor,
  color,
  texture,
}: {
  wireframe: boolean;
  showColor: boolean;
  color?: string;
  texture?: string;
}) {
  const materialColor = color || "#60a5fa";
  const roughness = texture === "glossy" ? 0.1 : 0.7;
  const metalness = texture === "glossy" ? 0.8 : 0.3;

  // Simple cube mesh (fallback when no model URL provided)
  return (
    <mesh>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial
        color={showColor ? materialColor : materialColor}
        wireframe={wireframe}
        emissive={wireframe ? materialColor : undefined}
        emissiveIntensity={wireframe ? 0.2 : 0}
        metalness={metalness}
        roughness={roughness}
      />
    </mesh>
  );
}

function ModelLoader({
  url,
  wireframe,
  showColor,
  opacity,
  onLoad,
}: {
  url: string;
  wireframe: boolean;
  showColor: boolean;
  opacity: number;
  onLoad?: () => void;
}) {
  const { scene } = useGLTF(url);

  // Clone the scene to avoid modifying the original
  const clonedScene = scene.clone();

  // Apply material updates reactively
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];

          materials.forEach((material) => {
            if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
              material.wireframe = wireframe;

              if (wireframe) {
                material.emissive = new THREE.Color("#60a5fa");
                material.emissiveIntensity = 0.2;
                material.color = new THREE.Color("#60a5fa");
              } else if (showColor) {
                material.emissive = new THREE.Color(0, 0, 0);
                material.emissiveIntensity = 0;
              } else {
                material.emissive = new THREE.Color("#60a5fa");
                material.emissiveIntensity = 0.1;
                material.color = new THREE.Color("#60a5fa");
              }

              material.opacity = opacity;
              material.transparent = opacity < 1;
              material.needsUpdate = true;
            }
          });
        }
      }
    });
  }, [clonedScene, wireframe, showColor, opacity]);

  useEffect(() => {
    onLoad?.();
  }, [onLoad]);

  return <primitive object={clonedScene} />;
}

function ModelLoaderWrapper({
  url,
  wireframe,
  showColor,
}: {
  url: string;
  wireframe: boolean;
  showColor: boolean;
}) {
  const [opacity, setOpacity] = useState(0);
  const fadeFrameRef = useRef<number | null>(null);
  const lastUrlRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (lastUrlRef.current !== url) {
      console.log(`[ModelViewer] New URL detected: ${url.substring(0, 60)}...`);
      lastUrlRef.current = url;
      hasLoadedRef.current = false;
      setOpacity(0);
      if (fadeFrameRef.current) {
        cancelAnimationFrame(fadeFrameRef.current);
        fadeFrameRef.current = null;
      }
    }
  }, [url]);

  const handleLoaded = useCallback(() => {
    if (hasLoadedRef.current) {
      console.log(`[ModelViewer] Skipping duplicate onLoad for same URL`);
      return;
    }
    hasLoadedRef.current = true;
    console.log(`[ModelViewer] GLB loaded successfully, starting fade-in animation`);
    const duration = 350;
    const start = performance.now();

    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setOpacity(progress);
      if (progress < 1) {
        fadeFrameRef.current = requestAnimationFrame(animate);
      } else {
        console.log(`[ModelViewer] Fade-in complete`);
      }
    };

    fadeFrameRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    return () => {
      if (fadeFrameRef.current) {
        cancelAnimationFrame(fadeFrameRef.current);
        fadeFrameRef.current = null;
      }
    };
  }, []);

  return (
    <Suspense fallback={null}>
      <ModelLoader
        url={url}
        wireframe={wireframe}
        showColor={showColor}
        opacity={opacity}
        onLoad={handleLoaded}
      />
    </Suspense>
  );
}

function LoadingPlaceholder() {
  return null;
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
  selectedColor,
  selectedTexture,
  lightingMode = "studio",
  wireframe = false,
  zoomAction,
  autoRotate = true,
}: ModelViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [contrast, setContrast] = useState(3.0);
  const [exposure, setExposure] = useState(2.0);
  const [showColor, setShowColor] = useState(true);

  // Handle zoom actions
  useEffect(() => {
    if (zoomAction && controlsRef.current) {
      const currentDistance = controlsRef.current.getDistance();
      let newDistance;

      if (zoomAction === "in") {
        newDistance = Math.max(currentDistance * 0.8, 2);
      } else if (zoomAction === "out") {
        newDistance = Math.min(currentDistance * 1.2, 10);
      }

      if (newDistance) {
        controlsRef.current.minDistance = newDistance;
        controlsRef.current.maxDistance = newDistance;
        controlsRef.current.update();

        // Reset back to normal range after a short delay
        setTimeout(() => {
          if (controlsRef.current) {
            controlsRef.current.minDistance = 2;
            controlsRef.current.maxDistance = 10;
          }
        }, 100);
      }
    }
  }, [zoomAction]);

  return (
    <div className="w-full h-full relative overflow-hidden">
      <Canvas
        camera={{ position: [2, 1.5, 3.5], fov: 50 }}
        gl={{
          toneMapping: 2, // ACESFilmic tone mapping
          toneMappingExposure: exposure,
        }}
        className="w-full h-full"
      >
        {/* Background color based on theme */}
        <color attach="background" args={["hsl(var(--muted)/0.3)"]} />

        {/* Subtle grid effect */}
        <mesh position={[0, 0, -10]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[50, 50, 20, 20]} />
          <meshBasicMaterial
            color="hsl(var(--muted-foreground))"
            wireframe
            transparent
            opacity={0.05}
          />
        </mesh>

        <Suspense fallback={null}>
          {/* HDR Environment for PBR materials */}
          <Environment preset={lightingMode} background={false} />

          {/* Additional subtle lighting with contrast control */}
          <ambientLight intensity={0.5 * contrast} />
          <directionalLight
            position={[5, 5, 5]}
            intensity={0.8 * contrast}
            castShadow
          />
          <directionalLight position={[-5, 3, -5]} intensity={0.3 * contrast} />

          {modelUrl && (
            <ModelLoaderWrapper
              url={modelUrl}
              wireframe={wireframe}
              showColor={showColor}
            />
          )}

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
