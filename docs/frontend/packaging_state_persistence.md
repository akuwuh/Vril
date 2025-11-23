# Packaging State Persistence Strategy

## Overview

This document describes the state persistence and caching architecture for the packaging workflow. Unlike the product viewer which tracks iteration history, the packaging system maintains a single current state with atomic texture updates to prevent data inconsistency during generation failures.

## Core Principles

1. **Redis stores metadata only** - Package type, dimensions, texture URLs. Never binary assets.
2. **Browser caches texture images** - Cache Storage API for persistence, in-memory Map for stable URLs.
3. **Atomic texture updates** - Bulk generation accumulates results before saving, preventing partial states.
4. **Idempotent operations** - Safe to retry on failure; state always converges to a consistent view.
5. **Hydration on mount** - Restore state from backend on page load, navigation, or reload.

## Architecture

### 1. Backend State (Redis)

**Key**: `packaging:current`

**Schema**: `PackagingState`
```python
{
  "package_type": "box" | "cylinder",
  "package_dimensions": {"width": 100, "height": 150, "depth": 100},
  "panel_textures": {
    "front": {
      "panel_id": "front",
      "texture_url": "data:image/png;base64,...",
      "prompt": "vintage floral pattern",
      "generated_at": "2024-11-23T10:30:00Z",
      "dimensions": {"width": 100, "height": 150}
    },
    // ... other panels
  },
  "in_progress": false,
  "generating_panel": null,
  "generating_panels": [],
  "bulk_generation_in_progress": false,
  "last_error": null,
  "created_at": "2024-11-23T10:00:00Z",
  "updated_at": "2024-11-23T10:30:00Z"
}
```

**Why single state instead of iterations**:
- Packaging is a design-in-progress workflow, not a historical record
- Dimensions and textures can be freely modified without preserving history
- Simpler implementation with fewer edge cases
- Focus on atomic consistency rather than rewind/replay capabilities

### 2. Client-Side Texture Cache

**File**: `frontend/lib/texture-cache.ts`

Two-tier caching identical to product viewer pattern:

```typescript
// Tier 1: Cache Storage (persistent, survives refresh)
Cache Storage "packaging-textures": 
  "texture_front" → PNG blob
  "texture_back" → PNG blob

// Tier 2: In-memory Map (session-only, prevents duplicate blob URLs)
Map<panelId, blobURL>:
  "front" → "blob:http://localhost:3000/abc-123..."
  "back" → "blob:http://localhost:3000/def-456..."
```

**Why two tiers**:
- `URL.createObjectURL(blob)` creates a **new string** every call, even for the same blob
- Without the in-memory Map, calling `getCachedTextureUrl("front", url)` twice returns different blob URLs
- React sees a new URL → triggers re-render → resets animation → potential infinite loop
- Solution: Cache the blob URL string in memory; return the same string for the same panel

### 3. Packaging Page Hydration

**File**: `frontend/app/packaging/page.tsx`

**On mount**:
```typescript
const hydrateFromBackend = async () => {
  const state = await getPackagingState();
  
  // Restore package configuration
  setPackageType(state.package_type);
  setDimensions(state.package_dimensions);
  
  // Restore textures from cache
  const cachedTextures = {};
  for (const [panelId, texture] of Object.entries(state.panel_textures)) {
    const cachedUrl = await getCachedTextureUrl(panelId, texture.texture_url);
    cachedTextures[panelId] = cachedUrl;
  }
  setPanelTextures(cachedTextures);
  
  // Resume polling if generation in progress
  if (state.in_progress || state.bulk_generation_in_progress) {
    setIsGenerating(true);
  }
};

// On mount
useEffect(() => {
  hydrateFromBackend().finally(() => stopLoading());
}, []);
```

**On dimension/type change**:
```typescript
const handleDimensionChange = async (key, value) => {
  const newDimensions = { ...dimensions, [key]: value };
  setDimensions(newDimensions);
  
  // Persist immediately
  await updatePackagingDimensions(packageType, newDimensions);
};
```

**On reload during generation**:
- Hydration detects `in_progress` or `bulk_generation_in_progress` flags
- Polling resumes automatically
- When generation completes, re-hydrates to fetch new textures

### 4. Atomic Texture Updates

**Problem**: If bulk generation fails mid-way, some panels have textures while others don't, creating inconsistent state.

**Solution**: Accumulate all textures in memory, then save atomically at the end.

**Backend Implementation** (`backend/app/endpoints/packaging/router.py`):

```python
@router.post("/panels/generate-all")
async def generate_all_panels(request: BulkPanelGenerateRequest):
    state = get_packaging_state()
    state.bulk_generation_in_progress = True
    state.generating_panels = request.panel_ids.copy()
    save_packaging_state(state)
    
    async def _generate_all():
        generated_textures = {}  # Accumulate here
        failed_panels = []
        
        for panel_id in request.panel_ids:
            try:
                # Generate texture (can fail)
                texture_url = await panel_generation_service.generate_panel_texture(...)
                
                if texture_url:
                    # Store in local dict, NOT in Redis yet
                    generated_textures[panel_id] = PanelTexture(
                        panel_id=panel_id,
                        texture_url=texture_url,
                        prompt=request.prompt,
                        dimensions=request.panels_info.get(panel_id, {}),
                    )
                else:
                    failed_panels.append(panel_id)
            except Exception as e:
                failed_panels.append(panel_id)
        
        # ATOMIC UPDATE: Save all textures at once
        final_state = get_packaging_state()
        if generated_textures:
            final_state.atomic_update_textures(generated_textures, replace=False)
        
        final_state.bulk_generation_in_progress = False
        final_state.generating_panel = None
        final_state.generating_panels = []
        final_state.last_error = f"Failed: {failed_panels}" if failed_panels else None
        
        save_packaging_state(final_state)  # Single Redis write
```

**Guarantees**:
- Either all successful textures are saved, or none
- No partial states visible to frontend
- Failed panels tracked in `last_error` for debugging
- Re-running generation is idempotent (overwrites previous attempt)

### 5. State Flow Diagrams

#### Single Panel Generation

```
User clicks "Generate" → POST /panels/generate
                              ↓
                        Mark in_progress=true
                        generating_panel="front"
                        Save to Redis
                              ↓
                        Background task starts
                              ↓
                   ┌──── Generate texture ────┐
                   │                           │
              ✅ Success                  ❌ Failure
                   │                           │
          Save texture                  Set last_error
          Clear in_progress             Clear in_progress
          Save to Redis                 Save to Redis
                   │                           │
                   └───────────┬───────────────┘
                               ↓
                    Frontend polls /status
                               ↓
                    in_progress = false
                               ↓
                    Re-hydrate state
                               ↓
                    Load texture from cache
```

#### Bulk Panel Generation

```
User clicks "Generate All" → POST /panels/generate-all
                                      ↓
                        Mark bulk_generation_in_progress=true
                        generating_panels=["front","back",...]
                        Save to Redis
                                      ↓
                              Background task starts
                                      ↓
                    generated_textures = {}  (in-memory)
                    failed_panels = []
                                      ↓
                        FOR EACH panel_id:
                           ├─ Update generating_panel = panel_id
                           ├─ Generate texture
                           ├─ IF success: textures[panel_id] = texture
                           └─ IF failure: failed_panels.append(panel_id)
                                      ↓
                        ┌─── All panels processed ───┐
                        │                             │
                   textures exist              All failed
                        │                             │
            atomic_update_textures()          Set last_error
            (ONE Redis write)                 Clear flags
                        │                             │
                        └──────────┬──────────────────┘
                                   ↓
                        Clear bulk_generation_in_progress
                        Clear generating_panel
                        Clear generating_panels
                        Save to Redis
                                   ↓
                        Frontend polls /status
                                   ↓
                        in_progress = false
                                   ↓
                        Re-hydrate state
                                   ↓
                        Load ALL textures from cache
```

## API Endpoints

### State Management

**`GET /packaging/state`**
- Returns complete `PackagingState` including dimensions, type, and all textures
- Used for hydration on mount/reload

**`POST /packaging/update-dimensions`**
```json
{
  "package_type": "box",
  "dimensions": {"width": 100, "height": 150, "depth": 100}
}
```
- Persists package type and dimensions
- Called on dimension slider changes or type switch

**`GET /packaging/status`**
```json
{
  "in_progress": true,
  "generating_panel": "front",
  "generating_panels": ["front", "back"],
  "last_error": null,
  "updated_at": "2024-11-23T10:30:00Z"
}
```
- Lightweight status for polling (no texture data)
- Frontend polls every 2 seconds during generation

**`POST /packaging/clear`**
- Resets state to defaults
- Clears all textures and dimensions

### Texture Generation

**`POST /packaging/panels/generate`** (single panel)
```json
{
  "panel_id": "front",
  "prompt": "vintage floral pattern",
  "package_type": "box",
  "panel_dimensions": {"width": 100, "height": 150},
  "package_dimensions": {"width": 100, "height": 150, "depth": 100}
}
```
- Generates texture for one panel
- Saves immediately on success

**`POST /packaging/panels/generate-all`** (bulk)
```json
{
  "prompt": "vintage floral pattern",
  "package_type": "box",
  "package_dimensions": {"width": 100, "height": 150, "depth": 100},
  "panel_ids": ["front", "back", "left", "right", "top", "bottom"],
  "panels_info": {
    "front": {"width": 100, "height": 150},
    "back": {"width": 100, "height": 150},
    // ...
  }
}
```
- Generates textures for multiple panels
- **Atomic save**: Accumulates all successful textures, saves once

## Idempotency & Fault Tolerance

### Idempotent Operations

| Operation | Behavior on Retry | Safe to Retry? |
|-----------|-------------------|----------------|
| `GET /state` | Returns current state | ✅ Yes (read-only) |
| `GET /status` | Returns generation status | ✅ Yes (read-only) |
| `POST /update-dimensions` | Overwrites with new values | ✅ Yes (last write wins) |
| `POST /panels/generate` | Re-generates texture, overwrites old | ✅ Yes (same prompt = same result) |
| `POST /panels/generate-all` | Re-generates all, atomically replaces | ✅ Yes (atomic operation) |

### Error Scenarios

**Scenario 1: Redis unavailable during save**
```python
def atomic_save_packaging_state(state: PackagingState) -> bool:
    try:
        redis_service.set_json(PACKAGING_STATE_KEY, state.as_json())
        return True
    except Exception as e:
        logger.error(f"Failed to save packaging state: {e}")
        return False  # Caller can retry or alert user
```

**Scenario 2: Generation fails mid-bulk**
- Failed panels tracked in `failed_panels` list
- Successful textures still saved atomically
- `last_error` shows which panels failed
- User can retry failed panels individually

**Scenario 3: Page reload during generation**
- Hydration detects `bulk_generation_in_progress = true`
- Polling resumes automatically
- When complete, re-hydrates to fetch new textures

**Scenario 4: Network error during polling**
- Polling continues (next interval retries)
- Exponential backoff not needed (2s is already slow)
- User can manually refresh to re-hydrate

## Performance Characteristics

| Scenario | Network | Cache Operations | Viewer Behavior |
|----------|---------|------------------|-----------------|
| **First texture generation** | Fetch base64 (~500KB, ~2s) | Store in Cache + Map | Texture appears immediately |
| **Reload same textures** | None | Map lookup (instant) | Instant display, no loading |
| **First reload after clearing browser** | None | Cache Storage read (~100ms), create blob URL | Textures appear ~100ms |
| **Dimension change** | POST /update-dimensions (~20ms) | None | 3D model regenerates locally |
| **Type switch (box → cylinder)** | POST /update-dimensions (~20ms) | None | Model changes, textures cleared |
| **Bulk generation (6 panels)** | 6 × Gemini API (~12s total) | Store 6 entries | Panel-by-panel updates |

## Common Pitfalls & Solutions

### Problem: Textures lost on reload

**Symptom**: After reload, 3D model shows default color instead of generated textures.

**Cause**: Cache hit returns new blob URL string → React sees new prop → re-renders without texture.

**Fix**: In-memory Map caches blob URL strings, reuses same string for same panel:
```typescript
if (blobUrlCache.has(panelId)) {
  return blobUrlCache.get(panelId)!;  // Same string every time
}
```

### Problem: Partial textures after bulk generation failure

**Symptom**: Some panels have textures, others don't, but no error shown.

**Cause**: Each panel saved immediately after generation, not atomically.

**Fix**: Accumulate in local dict, save all at once:
```python
generated_textures = {}  # Build this up
# ... loop through panels ...
final_state.atomic_update_textures(generated_textures, replace=False)
```

### Problem: Stale dimensions after type switch

**Symptom**: Switch from box to cylinder, but dimensions still show box values.

**Cause**: Local state updated, but backend not persisted.

**Fix**: Call backend immediately on type change:
```typescript
const handlePackageTypeChange = async (type: PackageType) => {
  setPackageType(type);
  const newDimensions = DEFAULT_PACKAGE_DIMENSIONS[type];
  setDimensions(newDimensions);
  await updatePackagingDimensions(type, newDimensions);
};
```

### Problem: Polling doesn't resume after reload

**Symptom**: Start bulk generation, reload page, polling stops, textures never appear.

**Cause**: `isGenerating` state not set on hydration.

**Fix**: Check backend state on mount:
```typescript
if (state.in_progress || state.bulk_generation_in_progress) {
  setIsGenerating(true);  // Trigger polling useEffect
}
```

## Debugging Checklist

### Textures don't load

1. **Check Network tab**: Is `/packaging/state` returning texture URLs?
   - **YES** → Cache issue
   - **NO** → Backend didn't save textures

2. **Check console**: Do you see `"[TextureCache] 💾 Cache hit for front"`?
   - **YES** → Blob URL created, check 3D viewer
   - **NO** → Cache miss, check Cache Storage in DevTools

3. **Check Cache Storage** (DevTools → Application → Cache Storage):
   - Look for `packaging-textures` cache
   - Should have `texture_front`, `texture_back`, etc.
   - **MISSING** → Texture never cached after generation

4. **Check `/packaging/state` response**:
   - `panel_textures` should have entries for each panel
   - `texture_url` should be base64 data URL or remote URL
   - **EMPTY** → Generation succeeded but didn't save

### Dimensions don't persist

1. **Check `/packaging/state`**: Does it have correct `package_dimensions`?
   - **YES** → Frontend not hydrating
   - **NO** → Backend not saving

2. **Check console**: Do you see `"[Packaging] 📦 Restoring type: box dimensions: {...}"`?
   - **YES** → Hydration worked, check local state
   - **NO** → Hydration not running or failing

3. **Check backend logs**: Did `/update-dimensions` endpoint get called?
   - **YES** → Verify Redis has data
   - **NO** → Frontend handler not calling API

### Polling doesn't work

1. **Check console**: Do you see `"[Packaging] 🔄 Starting polling for generation completion"`?
   - **YES** → Polling started
   - **NO** → `isGenerating` not set

2. **Check `/packaging/status`**: Is `in_progress` true?
   - **YES** → Backend still generating, keep polling
   - **NO** → Generation complete, should stop polling

3. **Check for errors**: Any network errors in console during polling?
   - **YES** → Backend down or CORS issue
   - **NO** → Polling working correctly

### Bulk generation shows partial results

1. **Check backend logs**: Did all panels finish generating?
   - **YES** → Check if atomic save happened
   - **NO** → Some panels failed, check `last_error`

2. **Check `/packaging/state`**: How many panels in `panel_textures`?
   - **6** → All succeeded
   - **< 6** → Partial failure, should have atomic save

3. **Check `last_error` in state**: Does it list failed panels?
   - **YES** → Expected behavior, retry failed panels
   - **NO** → Atomic save worked, all panels succeeded

## Comparison with Product Viewer

### Similarities

| Feature | Product Viewer | Packaging Viewer |
|---------|----------------|------------------|
| **Hydration pattern** | ✅ `hydrateProductState()` on mount | ✅ `hydrateFromBackend()` on mount |
| **Two-tier caching** | ✅ Cache Storage + Map for GLBs | ✅ Cache Storage + Map for textures |
| **Polling during generation** | ✅ Poll `/product/status` | ✅ Poll `/packaging/status` |
| **Stable blob URLs** | ✅ In-memory Map prevents new URLs | ✅ In-memory Map prevents new URLs |
| **Redis metadata** | ✅ Stores URLs, not binaries | ✅ Stores URLs, not binaries |

### Differences

| Aspect | Product Viewer | Packaging Viewer |
|--------|----------------|------------------|
| **State model** | Iteration history (`iterations[]`) | Single current state |
| **ID generation** | Stable iteration IDs (`iter_123`) | No IDs needed (panel IDs from type) |
| **Rewind capability** | ✅ Can rewind to previous iterations | ❌ No history tracking |
| **Atomic updates** | Not critical (one GLB per iteration) | ✅ Critical (bulk texture generation) |
| **Asset type** | GLB models (~2.5MB) | PNG textures (~500KB each) |
| **Cache key** | `model_glb_iter_123` | `texture_front` |

## Summary

The packaging state persistence architecture balances:

- **Consistency**: Atomic texture updates prevent partial states during bulk generation
- **Performance**: Two-tier caching enables instant reloads via Cache Storage + in-memory Map
- **Simplicity**: Single current state (no iteration history) reduces complexity
- **Robustness**: Idempotent operations make retries safe; polling resumes after reload
- **UX**: Immediate local updates with backend persistence; no loading spinners for cached textures

The key insight: **State persistence doesn't require iteration history**. For design workflows like packaging, a single current state with atomic updates provides better UX and simpler implementation while maintaining consistency guarantees.

