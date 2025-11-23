"use client"

import { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei"
import * as THREE from "three"
import type { PackageModel, PanelId } from "@/lib/packaging-types"
import { MiniDielineHud } from "@/components/mini-dieline-hud"

interface PackageViewer3DProps {
  model: PackageModel
  selectedPanelId?: PanelId | null
  onPanelSelect?: (panelId: PanelId | null) => void
  color?: string
  panelTextures?: Record<PanelId, string>
}

function BoxPackage3D({
  dimensions,
  selectedPanelId,
  onPanelSelect,
  color = "#93c5fd",
  panelTextures = {},
}: {
  dimensions: { width: number; height: number; depth: number }
  selectedPanelId?: PanelId | null
  onPanelSelect?: (panelId: PanelId | null) => void
  color?: string
  panelTextures?: Record<PanelId, string>
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { width, height, depth } = dimensions

  const fixedScale = 0.01 // 1mm = 0.01 Three.js units
  const w = width * fixedScale
  const h = height * fixedScale
  const d = depth * fixedScale

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.2
    }
  })

  // Create materials array that updates when textures change
  const materials = useMemo(() => {
    const faceToPanelMap: Record<number, PanelId> = {
      0: "right",
      1: "left",
      2: "top",
      3: "bottom",
      4: "front",
      5: "back",
    }

    const textureLoader = new THREE.TextureLoader()

    return Array.from({ length: 6 }, (_, i) => {
      const panelId = faceToPanelMap[i]
      const textureUrl = panelTextures[panelId]

      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.3,
        metalness: 0.1,
      })

      // Set selection highlight
      if (panelId === selectedPanelId) {
        material.emissive.set("#fbbf24")
        material.emissiveIntensity = 0.3
      }

      // Load texture IMMEDIATELY if available
      if (textureUrl) {
        console.log(`[BoxPackage3D] 🎨 Loading texture for ${panelId}`)
        textureLoader.load(
          textureUrl,
          (texture) => {
            texture.flipY = false
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping
            material.map = texture
            material.needsUpdate = true
            console.log(`[BoxPackage3D] ✅ Texture applied to ${panelId}`)
          },
          undefined,
          (error) => {
            console.error(`[BoxPackage3D] ❌ Failed to load texture for ${panelId}:`, error)
          }
        )
      }

      return material
    })
  }, [panelTextures, selectedPanelId, color])

  // Cleanup materials and textures on unmount
  useEffect(() => {
    return () => {
      materials.forEach((material) => {
        if (material.map) {
          material.map.dispose();
        }
        material.dispose();
      });
    };
  }, [materials]);

  const handleClick = (event: any) => {
    if (!onPanelSelect) return

    event.stopPropagation()
    const intersection = event.intersections?.[0]
    if (!intersection || intersection.faceIndex === undefined) return

    // Each face has 2 triangles, so divide by 2 to get face index
    const faceIndex = Math.floor(intersection.faceIndex / 2)

    // Three.js BoxGeometry face order: [right, left, top, bottom, front, back]
    const faceToPanelMap: Record<number, PanelId> = {
      0: "right",
      1: "left",
      2: "top",
      3: "bottom",
      4: "front",
      5: "back",
    }
    
    if (faceIndex >= 0 && faceIndex < 6) {
      const clickedPanel = faceToPanelMap[faceIndex]
      
      if (clickedPanel === selectedPanelId) {
        onPanelSelect(null) // Deselect if clicking same panel
      } else {
        onPanelSelect(clickedPanel)
      }
    }
  }

  return (
    <mesh
      ref={meshRef}
      castShadow
      receiveShadow
      onClick={handleClick}
      onPointerOver={(e) => {
        e.stopPropagation()
        document.body.style.cursor = "pointer"
      }}
      onPointerOut={() => {
        document.body.style.cursor = "default"
      }}
    >
      <boxGeometry args={[w, h, d]} />
      <primitive object={materials} attach="material" />
    </mesh>
  )
}

function CylinderPackage3D({
  dimensions,
  selectedPanelId,
  onPanelSelect,
  color = "#93c5fd",
  panelTextures = {},
}: {
  dimensions: { width: number; height: number; depth: number }
  selectedPanelId?: PanelId | null
  onPanelSelect?: (panelId: PanelId | null) => void
  color?: string
  panelTextures?: Record<PanelId, string>
}) {
  const groupRef = useRef<THREE.Group>(null)
  const { width, height } = dimensions

  const fixedScale = 0.01
  const radius = (width * fixedScale) / 2
  const cylinderHeight = height * fixedScale

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.2
    }
  })

  const baseMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.1,
    })
    
    // Apply body texture if available - load asynchronously
    const bodyTexture = panelTextures["body"]
    if (bodyTexture) {
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(
        bodyTexture,
        (texture) => {
          texture.flipY = false
          material.map = texture
          material.needsUpdate = true
        },
        undefined,
        (error) => {
          console.error("[CylinderPackage3D] Failed to load body texture:", error)
        }
      )
    }
    
    return material
  }, [color, panelTextures])

  const selectedMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fbbf24",
        roughness: 0.3,
        metalness: 0.1,
        emissive: "#fbbf24",
        emissiveIntensity: 0.3,
      }),
    []
  )
  
  const topMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.1,
    })
    
    const topTexture = panelTextures["top"]
    if (topTexture) {
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(
        topTexture,
        (texture) => {
          texture.flipY = false
          material.map = texture
          material.needsUpdate = true
        },
        undefined,
        (error) => {
          console.error("[CylinderPackage3D] Failed to load top texture:", error)
        }
      )
    }
    
    return material
  }, [color, panelTextures])
  
  const bottomMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.3,
      metalness: 0.1,
    })
    
    const bottomTexture = panelTextures["bottom"]
    if (bottomTexture) {
      const textureLoader = new THREE.TextureLoader()
      textureLoader.load(
        bottomTexture,
        (texture) => {
          texture.flipY = false
          material.map = texture
          material.needsUpdate = true
        },
        undefined,
        (error) => {
          console.error("[CylinderPackage3D] Failed to load bottom texture:", error)
        }
      )
    }
    
    return material
  }, [color, panelTextures])

  // Cleanup materials and textures on unmount
  useEffect(() => {
    return () => {
      [baseMaterial, selectedMaterial, topMaterial, bottomMaterial].forEach((material) => {
        if (material.map) {
          material.map.dispose();
        }
        material.dispose();
      });
    };
  }, [baseMaterial, selectedMaterial, topMaterial, bottomMaterial]);

  const handleBodyClick = (event: THREE.Event) => {
    if (!onPanelSelect) return
    event.stopPropagation()
    if ("body" === selectedPanelId) {
      onPanelSelect(null)
    } else {
      onPanelSelect("body")
    }
  }

  const handleTopClick = (event: THREE.Event) => {
    if (!onPanelSelect) return
    event.stopPropagation()
    if ("top" === selectedPanelId) {
      onPanelSelect(null)
    } else {
      onPanelSelect("top")
    }
  }

  const handleBottomClick = (event: THREE.Event) => {
    if (!onPanelSelect) return
    event.stopPropagation()
    if ("bottom" === selectedPanelId) {
      onPanelSelect(null)
    } else {
      onPanelSelect("bottom")
    }
  }

  return (
    <group ref={groupRef}>
      {/* Main cylinder body */}
      <mesh
        castShadow
        receiveShadow
        onClick={handleBodyClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default"
        }}
        material={selectedPanelId === "body" ? selectedMaterial : baseMaterial}
      >
        <cylinderGeometry args={[radius, radius, cylinderHeight, 32]} />
      </mesh>
      {/* Top cap */}
      <mesh
        position={[0, cylinderHeight / 2 + 0.01, 0]}
        castShadow
        receiveShadow
        onClick={handleTopClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default"
        }}
        material={selectedPanelId === "top" ? selectedMaterial : topMaterial}
      >
        <cylinderGeometry args={[radius, radius, 0.02, 32]} />
      </mesh>
      {/* Bottom cap */}
      <mesh
        position={[0, -cylinderHeight / 2 - 0.01, 0]}
        castShadow
        receiveShadow
        onClick={handleBottomClick}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default"
        }}
        material={selectedPanelId === "bottom" ? selectedMaterial : bottomMaterial}
      >
        <cylinderGeometry args={[radius, radius, 0.02, 32]} />
      </mesh>
    </group>
  )
}

function Package3D({ model, selectedPanelId, onPanelSelect, color, panelTextures }: PackageViewer3DProps) {
  const { type, dimensions } = model

  switch (type) {
    case "box":
      return (
        <BoxPackage3D
          dimensions={dimensions}
          selectedPanelId={selectedPanelId}
          onPanelSelect={onPanelSelect}
          color={color}
          panelTextures={panelTextures}
        />
      )

    case "cylinder":
      return (
        <CylinderPackage3D
          dimensions={dimensions}
          selectedPanelId={selectedPanelId}
          onPanelSelect={onPanelSelect}
          color={color}
          panelTextures={panelTextures}
        />
      )

    default:
      return null
  }
}

export function PackageViewer3D(props: PackageViewer3DProps) {
  // Cleanup effect to dispose of textures on unmount
  useEffect(() => {
    return () => {
      // Cleanup will be handled by Canvas unmount
    };
  }, []);

  return (
    <div className="w-full h-full bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-border overflow-hidden relative">
      <Canvas 
        key="packaging-viewer-canvas"
        shadows
        gl={{
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
          antialias: true,
        }}
        frameloop="always"
      >
        <PerspectiveCamera makeDefault position={[4, 3, 4]} />
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} minDistance={2} maxDistance={10} />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[5, 5, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-5, 5, -5]} intensity={0.5} />

        {/* Environment for reflections */}
        <Environment preset="apartment" />

        {/* Package */}
        <Package3D {...props} />
      </Canvas>

      {props.model.dielines && <MiniDielineHud dielines={props.model.dielines} />}
    </div>
  )
}
