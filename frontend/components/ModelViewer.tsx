"use client";

import { useRef, useState, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useGLTF } from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

interface ModelViewerProps {
  modelUrl?: string;
  isLoading?: boolean;
  error?: string | null;
  onModelLoaded?: (url: string) => void;
  selectedColor?: string;
  selectedTexture?: string;
  lightingMode?: "studio" | "sunset" | "warehouse" | "forest";
  wireframe?: boolean;
  zoomAction?: "in" | "out" | null;
  autoRotate?: boolean;
  placeholderImage?: string;
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
}: {
  url: string;
  wireframe: boolean;
  showColor: boolean;
}) {
  const { scene } = useGLTF(url);

  // Clone the scene to avoid modifying the original
  const clonedScene = scene.clone();

  // Apply wireframe/texture mode to all meshes in the scene
  clonedScene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.material) {
        // Handle both single material and material arrays
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((material) => {
          if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
            material.wireframe = wireframe;

            if (wireframe) {
              // Wireframe mode: emissive blue
              material.emissive = new THREE.Color("#60a5fa");
              material.emissiveIntensity = 0.2;
              material.color = new THREE.Color("#60a5fa");
            } else if (showColor) {
              // Base texture mode: reset to original colors
              material.emissive = new THREE.Color(0, 0, 0);
              material.emissiveIntensity = 0;
              // Keep original colors
            } else {
              // Default: blue tint
              material.emissive = new THREE.Color("#60a5fa");
              material.emissiveIntensity = 0.1;
              material.color = new THREE.Color("#60a5fa");
            }

            material.needsUpdate = true;
          }
        });
      }
    }
  });

  return <primitive object={clonedScene} />;
}

function ModelLoaderWrapper({
  url,
  wireframe,
  showColor,
  onLoad,
  onError,
}: {
  url: string;
  wireframe: boolean;
  showColor: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}) {
  useEffect(() => {
    onLoad?.();
  }, [url, onLoad]);

  return (
    <Suspense fallback={<LoadingPlaceholder />}>
      <ModelLoader
        url={url}
        wireframe={wireframe}
        showColor={showColor}
      />
    </Suspense>
  );
}

function LoadingPlaceholder() {
  return null;
}

function LoadingSkeleton({ placeholderImage }: { placeholderImage?: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
      <div className="text-center space-y-4">
        {placeholderImage ? (
          <div className="relative mx-auto w-40 h-40 rounded-xl overflow-hidden border border-white/20 shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={placeholderImage}
              alt="Preview placeholder"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/10 to-black/40" />
          </div>
        ) : (
          <div className="mb-2">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        )}
        <div>
          <p className="text-blue-400 text-lg font-semibold mb-1">Loading 3D Model</p>
          <p className="text-gray-400 text-sm">This may take a few moments...</p>
        </div>
      </div>
    </div>
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
  isLoading,
  error,
  onModelLoaded,
  selectedColor,
  selectedTexture,
  lightingMode = "studio",
  wireframe = false,
  zoomAction,
  autoRotate = true,
  placeholderImage,
}: ModelViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [contrast, setContrast] = useState(3.0);
  const [exposure, setExposure] = useState(2.0);
  const [showColor, setShowColor] = useState(true);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

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

  // Effect to handle model loading states
  useEffect(() => {
    if (modelUrl) {
      setIsModelLoading(true);
      setModelLoadError(null);
    }
  }, [modelUrl]);

  // Determine content to render
  let content;
  if (isLoading || (modelUrl && isModelLoading)) {
    content = <LoadingSkeleton placeholderImage={placeholderImage} />;
  } else if (error || modelLoadError) {
    const errorMessage = modelLoadError || error || 'Failed to load model';
    content = <ErrorDisplay message={errorMessage} />;
  } else {
    content = (
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

        <Suspense fallback={<LoadingPlaceholder />}>
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

          {modelUrl ? (
            <ModelLoaderWrapper
              url={modelUrl}
              wireframe={wireframe}
              showColor={showColor}
              onLoad={() => {
                setIsModelLoading(false);
                setModelLoadError(null);
              }}
              onError={(error) => {
                setIsModelLoading(false);
                setModelLoadError(error.message);
              }}
            />
          ) : (
            <CubeModel
              wireframe={wireframe}
              showColor={showColor}
              color={selectedColor}
              texture={selectedTexture}
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
    );
  }

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Main Content */}
      {content}
    </div>
  );
}
