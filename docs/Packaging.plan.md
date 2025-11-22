<!-- dd4306cf-4c4e-480f-9da5-1e718fae0958 b5d2d584-4b99-4ba9-82d2-e928b58b8e94 -->
# Ultra-Detailed Packaging Panel Generation System Implementation Plan

## Overview

Build a complete panel-by-panel image generation system that integrates with the existing packaging dieline editor. Each panel is generated independently with strict dimensional accuracy, panel-specific content rules, and brand consistency.

## Architecture Components

### 1. Backend: Panel State & Data Models (`backend/app/models/packaging_panel.py`)

**Create comprehensive data models:**

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime

class PanelDimensions(BaseModel):
    width: int  # pixels
    height: int  # pixels
    aspect_ratio: float

class PanelCoordinates(BaseModel):
    x: float  # UV map position
    y: float  # UV map position

class PanelCrop(BaseModel):
    """Editable region definition"""
    x: float
    y: float
    width: float
    height: float

class PanelImage(BaseModel):
    panel_name: Literal["front", "back", "left", "right", "top", "bottom"]
    image_url: str
    dimensions: PanelDimensions
    coordinates: PanelCoordinates
    crop: PanelCrop
    generated_at: datetime
    iteration_count: int = 0

class PackagingState(BaseModel):
    """Single session state for packaging design"""
    package_type: Literal["box", "cylinder", "bag"]
    package_dimensions: dict  # width, height, depth
    panels: dict[str, PanelImage] = Field(default_factory=dict)
    uv_atlas_url: Optional[str] = None
    reference_images: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
```

**Redis helpers** (extend `backend/app/models/packaging_panel.py`):

- `get_packaging_state() -> PackagingState`
- `save_packaging_state(state: PackagingState) -> None`
- `clear_packaging_state() -> None`
- Use key: `packaging:current` with 24h TTL

### 2. Backend: Panel Identification Service (`backend/app/services/panel_identification.py`)

**Map dieline paths to panel names:**

```python
def identify_panels_from_dieline(
    dielines: List[DielinePath],
    package_type: str,
    dimensions: dict
) -> dict[str, dict]:
    """
    Analyze dieline paths and return panel mapping:
    {
        "front": {"path_index": 1, "points": [...], "bounds": {...}},
        "back": {...},
        ...
    }
    """
    # Algorithm:
    # 1. For box: Identify largest face (front), opposite (back)
    # 2. Calculate bounding boxes for each path
    # 3. Use position relative to package dimensions to identify sides
    # 4. Top/bottom identified by smaller dimensions
    # 5. Return mapping with path indices and calculated dimensions
```

**Calculate panel dimensions from dieline:**

- Extract bounding box from path points
- Convert mm to pixels (DPI: 300 for print-ready)
- Calculate aspect ratio
- Determine UV coordinates within full dieline canvas

### 3. Backend: Panel Generation Service (`backend/app/services/panel_generation.py`)

**Core generation service:**

```python
class PanelGenerationService:
    def __init__(self):
        self.gemini_client = gemini_chat_service
        self.image_api_url = settings.GEMINI_PRODUCT_IMAGE_API_URL
        self.image_api_key = settings.GEMINI_PRODUCT_IMAGE_API_KEY
    
    async def generate_panel(
        self,
        panel_name: str,
        dimensions: PanelDimensions,
        coordinates: PanelCoordinates,
        crop: PanelCrop,
        user_prompt: str,
        reference_images: Optional[List[str]] = None,
        existing_panel_image: Optional[str] = None
    ) -> str:
        """
        Generate single panel image following all strict rules.
        Returns image URL.
        """
        # 1. Build ultra-detailed system prompt (from user's prompt)
        system_prompt = self._build_system_prompt(
            panel_name, dimensions, coordinates, crop, 
            reference_images, existing_panel_image
        )
        
        # 2. Combine with user prompt
        full_prompt = f"{system_prompt}\n\nUSER REQUEST: {user_prompt}"
        
        # 3. Call image generation API
        # 4. Validate output dimensions
        # 5. Return image URL
        
    def _build_system_prompt(
        self, panel_name, dimensions, coordinates, crop,
        reference_images, existing_panel_image
    ) -> str:
        """Construct the ultra-detailed system prompt from template"""
        # Use the exact prompt structure provided by user
        # Include all rules: dimensional, content, layout, style
```

**Panel-specific content validation:**

- `_validate_panel_content(panel_name: str, image_url: str) -> bool`
- Check for forbidden elements (barcode on front, etc.)
- Use Gemini vision API to analyze generated image

### 4. Backend: Packaging API Router (`backend/app/endpoints/packaging/router.py`)

**Endpoints:**

```python
router = APIRouter(prefix="/packaging", tags=["packaging"])

@router.post("/panels/identify")
async def identify_panels(request: IdentifyPanelsRequest):
    """
    Analyze dieline and return panel mapping.
    Request: {dielines: [...], package_type: str, dimensions: {...}}
    Response: {panels: {front: {...}, back: {...}, ...}}
    """

@router.post("/panels/{panel_name}/generate")
async def generate_panel(
    panel_name: str,
    request: GeneratePanelRequest
):
    """
    Generate single panel image.
    Request: {
        prompt: str,
        dimensions: {width, height},
        coordinates: {x, y},
        crop: {x, y, width, height},
        reference_images?: string[],
        existing_image?: string
    }
    Response: {image_url: str, panel: PanelImage}
    """

@router.post("/panels/{panel_name}/edit")
async def edit_panel(panel_name: str, request: EditPanelRequest):
    """
    Iteratively edit existing panel.
    Request: {prompt: str, preserve_layout: bool}
    """

@router.get("/panels")
async def get_all_panels():
    """Get all generated panels for current session"""

@router.get("/panels/{panel_name}")
async def get_panel(panel_name: str):
    """Get specific panel details"""

@router.post("/uv-atlas/generate")
async def generate_uv_atlas():
    """
    Combine all panel images into UV atlas.
    Returns: {uv_atlas_url: str}
    """
```

### 5. Frontend: Panel Types & State (`frontend/lib/packaging-panel-types.ts`)

**TypeScript types:**

```typescript
export type PanelName = "front" | "back" | "left" | "right" | "top" | "bottom";

export interface PanelDimensions {
  width: number;
  height: number;
  aspectRatio: number;
}

export interface PanelCoordinates {
  x: number;
  y: number;
}

export interface PanelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelImage {
  panelName: PanelName;
  imageUrl: string;
  dimensions: PanelDimensions;
  coordinates: PanelCoordinates;
  crop: PanelCrop;
  generatedAt: string;
  iterationCount: number;
}

export interface PackagingState {
  packageType: PackageType;
  packageDimensions: PackageDimensions;
  panels: Record<PanelName, PanelImage | null>;
  uvAtlasUrl?: string;
  referenceImages: string[];
}
```

### 6. Frontend: Panel Identification Hook (`frontend/hooks/usePanelIdentification.ts`)

**React hook for panel identification:**

```typescript
export function usePanelIdentification() {
  const identifyPanels = async (
    dielines: DielinePath[],
    packageType: PackageType,
    dimensions: PackageDimensions
  ) => {
    const response = await fetch("/api/packaging/panels/identify", {
      method: "POST",
      body: JSON.stringify({ dielines, packageType, dimensions })
    });
    return response.json();
  };
  
  return { identifyPanels };
}
```

### 7. Frontend: Panel Generation Hook (`frontend/hooks/usePanelGeneration.ts`)

**React hook for panel generation:**

```typescript
export function usePanelGeneration() {
  const [generating, setGenerating] = useState<string | null>(null);
  
  const generatePanel = async (
    panelName: PanelName,
    prompt: string,
    dimensions: PanelDimensions,
    coordinates: PanelCoordinates,
    crop: PanelCrop,
    referenceImages?: string[]
  ) => {
    setGenerating(panelName);
    try {
      const response = await fetch(`/api/packaging/panels/${panelName}/generate`, {
        method: "POST",
        body: JSON.stringify({
          prompt,
          dimensions,
          coordinates,
          crop,
          referenceImages
        })
      });
      return response.json();
    } finally {
      setGenerating(null);
    }
  };
  
  return { generatePanel, generating };
}
```

### 8. Frontend: Panel Selector Component (`frontend/components/PanelSelector.tsx`)

**UI for selecting and managing panels:**

```typescript
interface PanelSelectorProps {
  panels: Record<PanelName, PanelImage | null>;
  selectedPanel: PanelName | null;
  onSelectPanel: (panel: PanelName) => void;
  onGeneratePanel: (panel: PanelName, prompt: string) => void;
}

export function PanelSelector({ ... }: PanelSelectorProps) {
  // Display grid of 6 panels (front, back, left, right, top, bottom)
  // Show preview if generated, placeholder if not
  // Click to select and generate/edit
}
```

### 9. Frontend: Panel Editor Component (`frontend/components/PanelEditor.tsx`)

**Editor for individual panel:**

```typescript
interface PanelEditorProps {
  panelName: PanelName;
  panelImage: PanelImage | null;
  dimensions: PanelDimensions;
  onGenerate: (prompt: string) => void;
  onEdit: (prompt: string) => void;
}

export function PanelEditor({ ... }: PanelEditorProps) {
  // Display panel preview
  // Input for generation prompt
  // Reference image upload
  // Generate/Edit buttons
  // Show dimensional constraints
  // Display panel-specific content rules
}
```

### 10. Frontend: Enhanced Dieline Editor (`frontend/components/dieline-editor.tsx`)

**Add panel visualization:**

- Overlay panel boundaries on dieline canvas
- Color-code panels (front=blue, back=red, etc.)
- Click panel region to select for generation
- Show panel dimensions and coordinates
- Display generated panel images as overlays

**New features:**

- Panel selection mode
- Panel boundary highlighting
- Dimension display for selected panel
- Integration with panel generation API

### 11. Frontend: Enhanced Package Viewer (`frontend/components/package-viewer-3d.tsx`)

**Apply panel images as textures:**

- Load UV atlas or individual panel images
- Map to 3D geometry faces
- Update texture when panel regenerated
- Support real-time preview updates

**UV mapping:**

- Calculate UV coordinates from panel coordinates
- Apply textures to correct faces
- Handle different package types (box vs cylinder)

### 12. Frontend: Packaging Page Integration (`frontend/app/packaging/page.tsx`)

**Add panel generation UI:**

- Panel selector sidebar
- Panel editor panel
- Generation status indicators
- Reference image management
- UV atlas preview

**State management:**

- Track panel images
- Manage generation state
- Handle panel selection
- Sync with dieline changes

### 13. Backend: Configuration (`backend/app/core/config.py`)

**Add packaging-specific settings:**

```python
PACKAGING_PANEL_DPI: int = 300  # Print resolution
PACKAGING_PANEL_MIN_SIZE: int = 100  # pixels
PACKAGING_PANEL_MAX_SIZE: int = 5000  # pixels
PACKAGING_SAFE_MARGIN_PERCENT: float = 0.05  # 5% safe area
PACKAGING_STATE_TTL_SECONDS: int = 24 * 60 * 60
```

### 14. Backend: Validation & Error Handling

**Dimensional validation:**

- Verify output image matches exact dimensions
- Check aspect ratio preservation
- Validate crop boundaries
- Ensure no distortion

**Content validation:**

- Panel-specific rule checking
- Forbidden element detection
- Layout preservation verification

**Error handling:**

- Retry logic for API failures
- Graceful degradation
- Clear error messages

### 15. Testing Strategy

**Unit tests:**

- Panel identification algorithm
- Dimension calculations
- UV coordinate mapping
- Content validation rules

**Integration tests:**

- End-to-end panel generation flow
- Panel editing iterations
- UV atlas generation
- Frontend-backend integration

## Implementation Order

1. **Phase 1: Backend Foundation**

   - Data models and Redis helpers
   - Panel identification service
   - Basic API endpoints

2. **Phase 2: Generation Service**

   - Panel generation service with strict prompt
   - Integration with image API
   - Validation logic

3. **Phase 3: Frontend Foundation**

   - TypeScript types
   - React hooks
   - Basic panel selector UI

4. **Phase 4: Dieline Integration**

   - Panel visualization in dieline editor
   - Panel selection from dieline
   - Dimension display

5. **Phase 5: 3D Preview Integration**

   - UV mapping
   - Texture application
   - Real-time updates

6. **Phase 6: Polish & Testing**

   - Error handling
   - Loading states
   - Validation feedback
   - Comprehensive testing

## Key Technical Considerations

**Dimensional Accuracy:**

- Always specify exact pixel dimensions in API calls
- Validate output dimensions before returning
- Use high DPI (300) for print-ready output
- Never allow aspect ratio changes

**Panel Content Rules:**

- Enforce panel-specific rules in system prompt
- Validate generated content
- Provide clear feedback on violations

**Performance:**

- Cache panel images
- Lazy load panel previews
- Optimize UV atlas generation
- Use background jobs for long operations

**User Experience:**

- Clear visual feedback during generation
- Show dimensional constraints
- Display panel-specific rules
- Provide iteration history