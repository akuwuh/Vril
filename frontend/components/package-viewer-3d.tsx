"use client"

import React, { useRef, useMemo, useEffect } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import type { ThreeEvent } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei"
import { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import * as THREE from "three"
import type { PackageModel, PanelId } from "@/lib/packaging-types"
import { MiniDielineHud } from "@/components/mini-dieline-hud"

interface PackageViewer3DProps {
  model: PackageModel
  selectedPanelId?: PanelId | null
  onPanelSelect?: (panelId: PanelId | null) => void
  color?: string
  panelTextures?: Partial<Record<PanelId, string>>
  lightingMode?: "studio" | "sunset" | "warehouse" | "forest"
  wireframe?: boolean
  zoomAction?: "in" | "out" | null
  autoRotate?: boolean
}

const BoxPackage3D = React.memo(function BoxPackage3D({
  dimensions,
  selectedPanelId,
  onPanelSelect,
  color = "#93c5fd",
  panelTextures = {},
  wireframe = false,
  autoRotate = true,
}: {
  dimensions: { width: number; height: number; depth: number }
  selectedPanelId?: PanelId | null
  onPanelSelect?: (panelId: PanelId | null) => void
  color?: string
  panelTextures?: Partial<Record<PanelId, string>>
  wireframe?: boolean
  autoRotate?: boolean
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const { width, height, depth } = dimensions

  const fixedScale = 0.01 // 1mm = 0.01 Three.js units
  const w = width * fixedScale
  const h = height * fixedScale
  const d = depth * fixedScale

  useFrame((state) => {
    if (meshRef.current && autoRotate) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.2
    }
  })

  // Create materials array with lazy texture loading
  const materials = useMemo(() => {
    const faceToPanelMap: Record<number, PanelId> = {
      0: "right",
      1: "left",
      2: "top",
      3: "bottom",
      4: "front",
      5: "back",
    }

    return Array.from({ length: 6 }, (_, i) => {
      const panelId = faceToPanelMap[i]
      const textureUrl = panelTextures[panelId]

      // Create base material
      const material = new THREE.MeshStandardMaterial({
        color: textureUrl ? 0xffffff : color,
        roughness: 0.3,
        metalness: 0.1,
        wireframe,
      })

      // Set selection highlight
      if (panelId === selectedPanelId) {
        material.emissive.set("#fbbf24")
        material.emissiveIntensity = 0.3
      }

      return material
    })
  }, [color, wireframe]) // Remove panelTextures and selectedPanelId from deps

  // Load textures asynchronously after materials are created
  useEffect(() => {
    const faceToPanelMap: Record<number, PanelId> = {
      0: "right",
      1: "left",
      2: "top",
      3: "bottom",
      4: "front",
      5: "back",
    }

    const textureLoader = new THREE.TextureLoader()

    materials.forEach((material, i) => {
      const panelId = faceToPanelMap[i]
      const textureUrl = panelTextures[panelId]

      // Clear existing texture if no longer available
      if (!textureUrl && material.map) {
        material.map.dispose()
        material.map = null
        material.color.setHex(color)
        material.userData.textureUrl = null
        material.needsUpdate = true
        return
      }

      // Load texture asynchronously if available and different
      if (textureUrl && (!material.map || material.userData.textureUrl !== textureUrl)) {
        console.log(`[BoxPackage3D] 🎨 Loading texture for ${panelId}`)
        textureLoader.load(
          textureUrl,
          (texture) => {
            // Enable texture flipping for correct orientation
            texture.flipY = true

            // Use ClampToEdge to prevent border artifacts
            texture.wrapS = THREE.ClampToEdgeWrapping
            texture.wrapT = THREE.ClampToEdgeWrapping

            // Use nearest or linear filtering to prevent edge bleeding
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter

            // Ensure texture covers full UV space (0-1)
            texture.repeat.set(1, 1)
            texture.offset.set(0, 0)
            
            // Cleanup old texture
            if (material.map) material.map.dispose()

            // Apply to material
            material.map = texture
            material.color.setHex(0xffffff) // Set to white so texture shows true colors
            material.userData.textureUrl = textureUrl // Track current URL
            material.needsUpdate = true
            console.log(`[BoxPackage3D] ✅ Texture applied to ${panelId}`)
          },
          undefined,
          (error) => {
            console.error(`[BoxPackage3D] ❌ Failed to load texture for ${panelId}:`, error)
          }
        )
      }
    })

    // Update selection highlights
    materials.forEach((material, i) => {
      const panelId = faceToPanelMap[i]
      const isSelected = panelId === selectedPanelId

      if (isSelected && material.emissive.getHex() !== 0xfbbf24) {
        material.emissive.set("#fbbf24")
        material.emissiveIntensity = 0.3
      } else if (!isSelected && material.emissive.getHex() !== 0x000000) {
        material.emissive.set("#000000")
        material.emissiveIntensity = 0
      }
      material.needsUpdate = true
    })
  }, [panelTextures, selectedPanelId, materials, color])

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPanelSelect) return

    event.stopPropagation()
    const intersection = event.intersections?.[0]
    if (!intersection || intersection.faceIndex == null) return

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
})

const CylinderPackage3D = React.memo(function CylinderPackage3D({
  dimensions,
  selectedPanelId,
  onPanelSelect,
  color = "#93c5fd",
  panelTextures = {},
  wireframe = false,
  autoRotate = true,
}: {
  dimensions: { width: number; height: number; depth: number }
  selectedPanelId?: PanelId | null
  onPanelSelect?: (panelId: PanelId | null) => void
  color?: string
  panelTextures?: Partial<Record<PanelId, string>>
  wireframe?: boolean
  autoRotate?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const { width, height } = dimensions

  const fixedScale = 0.01
  const radius = (width * fixedScale) / 2
  const cylinderHeight = height * fixedScale

  useFrame((state) => {
    if (groupRef.current && autoRotate) {
      groupRef.current.rotation.y = state.clock.getElapsedTime() * 0.2
    }
  })

  const baseMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
      wireframe,
    })
  }, [wireframe])

  const selectedMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fbbf24",
        roughness: 0.3,
        metalness: 0.1,
        emissive: "#fbbf24",
        emissiveIntensity: 0.3,
        wireframe,
      }),
    [wireframe]
  )

  const topMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
      wireframe,
    })
  }, [wireframe])

  const bottomMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
      wireframe,
    })
  }, [wireframe])

  // Load textures asynchronously for cylinder
  useEffect(() => {
    const textureLoader = new THREE.TextureLoader()

    // Load body texture
    const bodyTexture = panelTextures["body"]
    if (bodyTexture && (!baseMaterial.map || baseMaterial.userData.textureUrl !== bodyTexture)) {
      console.log("[CylinderPackage3D] 🎨 Loading body texture:", bodyTexture)
      textureLoader.load(
        bodyTexture,
        (texture) => {
          texture.flipY = true
          texture.wrapS = THREE.RepeatWrapping
          texture.wrapT = THREE.ClampToEdgeWrapping
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.repeat.set(1, 1)
          texture.offset.set(0, 0)
          
          // Cleanup old texture
          if (baseMaterial.map) baseMaterial.map.dispose()
          
          baseMaterial.map = texture
          baseMaterial.color.setHex(0xffffff)
          baseMaterial.userData.textureUrl = bodyTexture // Track current URL
          baseMaterial.needsUpdate = true
          console.log("[CylinderPackage3D] ✅ Body texture applied")
        },
        undefined,
        (error) => {
          console.error("[CylinderPackage3D] ❌ Failed to load body texture:", error)
        }
      )
    } else if (!bodyTexture && baseMaterial.map) {
      baseMaterial.map.dispose()
      baseMaterial.map = null
      baseMaterial.color.setHex(color)
      baseMaterial.userData.textureUrl = null
      baseMaterial.needsUpdate = true
    }

    // Load top texture
    const topTexture = panelTextures["top"]
    if (topTexture && (!topMaterial.map || topMaterial.userData.textureUrl !== topTexture)) {
      textureLoader.load(
        topTexture,
        (texture) => {
          texture.flipY = true
          texture.wrapS = THREE.ClampToEdgeWrapping
          texture.wrapT = THREE.ClampToEdgeWrapping
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.repeat.set(1, 1)
          texture.offset.set(0, 0)
          
          if (topMaterial.map) topMaterial.map.dispose()
          
          topMaterial.map = texture
          topMaterial.color.setHex(0xffffff)
          topMaterial.userData.textureUrl = topTexture
          topMaterial.needsUpdate = true
        },
        undefined,
        (error) => {
          console.error("[CylinderPackage3D] Failed to load top texture:", error)
        }
      )
    } else if (!topTexture && topMaterial.map) {
      topMaterial.map.dispose()
      topMaterial.map = null
      topMaterial.color.setHex(color)
      topMaterial.userData.textureUrl = null
      topMaterial.needsUpdate = true
    }

    // Load bottom texture
    const bottomTexture = panelTextures["bottom"]
    if (bottomTexture && (!bottomMaterial.map || bottomMaterial.userData.textureUrl !== bottomTexture)) {
      textureLoader.load(
        bottomTexture,
        (texture) => {
          texture.flipY = true
          texture.wrapS = THREE.ClampToEdgeWrapping
          texture.wrapT = THREE.ClampToEdgeWrapping
          texture.minFilter = THREE.LinearFilter
          texture.magFilter = THREE.LinearFilter
          texture.repeat.set(1, 1)
          texture.offset.set(0, 0)
          
          if (bottomMaterial.map) bottomMaterial.map.dispose()
          
          bottomMaterial.map = texture
          bottomMaterial.color.setHex(0xffffff)
          bottomMaterial.userData.textureUrl = bottomTexture
          bottomMaterial.needsUpdate = true
        },
        undefined,
        (error) => {
          console.error("[CylinderPackage3D] Failed to load bottom texture:", error)
        }
      )
    } else if (!bottomTexture && bottomMaterial.map) {
      bottomMaterial.map.dispose()
      bottomMaterial.map = null
      bottomMaterial.color.setHex(color)
      bottomMaterial.userData.textureUrl = null
      bottomMaterial.needsUpdate = true
    }
  }, [panelTextures, baseMaterial, topMaterial, bottomMaterial, color])

  const handleBodyClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPanelSelect) return
    event.stopPropagation()
    if ("body" === selectedPanelId) {
      onPanelSelect(null)
    } else {
      onPanelSelect("body")
    }
  }

  const handleTopClick = (event: ThreeEvent<MouseEvent>) => {
    if (!onPanelSelect) return
    event.stopPropagation()
    if ("top" === selectedPanelId) {
      onPanelSelect(null)
    } else {
      onPanelSelect("top")
    }
  }

  const handleBottomClick = (event: ThreeEvent<MouseEvent>) => {
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
      {/* Main cylinder body - openEnded to avoid z-fighting with caps */}
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
        <cylinderGeometry args={[radius, radius, cylinderHeight, 32, 1, true]} />
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
})

const Package3D = React.memo(function Package3D({ 
  model, 
  selectedPanelId, 
  onPanelSelect, 
  color, 
  panelTextures,
  wireframe = false,
  autoRotate = true,
}: PackageViewer3DProps) {
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
          wireframe={wireframe}
          autoRotate={autoRotate}
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
          wireframe={wireframe}
          autoRotate={autoRotate}
        />
      )

    default:
      return null
  }
})

export function PackageViewer3D(props: PackageViewer3DProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([])
  const {
    lightingMode = "studio",
    wireframe = false,
    zoomAction,
    autoRotate = true,
  } = props

  // Cleanup textures on unmount
  useEffect(() => {
    return () => {
      materialsRef.current.forEach(material => {
        if (material.map) {
          material.map.dispose()
        }
        material.dispose()
      })
    }
  }, [])

  useEffect(() => {
    if (!zoomAction || !controlsRef.current) return

    const currentDistance = controlsRef.current.getDistance()
    const newDistance = zoomAction === "in" 
      ? Math.max(currentDistance * 0.8, 2) 
      : Math.min(currentDistance * 1.2, 10)

    controlsRef.current.minDistance = newDistance
    controlsRef.current.maxDistance = newDistance
    controlsRef.current.update()

    const timer = setTimeout(() => {
      if (controlsRef.current) {
        controlsRef.current.minDistance = 2
        controlsRef.current.maxDistance = 10
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [zoomAction])

  return (
    <div className="w-full h-full bg-linear-to-br from-slate-50 to-slate-100 rounded-lg border border-border overflow-hidden relative">
      <Canvas
        key="packaging-viewer-canvas"
        shadows
        gl={{
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
          antialias: true,
        }}
        frameloop="demand" // Only render when needed, not constantly
      >
        <PerspectiveCamera makeDefault position={[4, 3, 4]} />
        <OrbitControls 
          ref={controlsRef}
          enablePan={true} 
          enableZoom={true} 
          enableRotate={true} 
          minDistance={2} 
          maxDistance={10}
          enableDamping
          dampingFactor={0.05}
        />

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
        <Environment preset={lightingMode} background={false} />

        {/* Package */}
        <Package3D {...props} wireframe={wireframe} autoRotate={autoRotate} />
      </Canvas>

      {props.model.dielines && <MiniDielineHud dielines={props.model.dielines} />}
    </div>
  )
}
