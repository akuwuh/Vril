# Demo Mode Guide

This guide covers two demo features:
1. **Artifact Saving** - Save all generated assets locally
2. **State Seeding** - Pre-load product/packaging for instant demos

---

# Part 1: Save Artifacts Locally

## What is Demo Mode?

Demo mode enables automatic saving of all generated assets (images, 3D models, videos) to your local filesystem at `backend/tests/artifacts/`. This is perfect for:

- 🎨 **Presentations & Demos** - Build a portfolio of generated products
- 🐛 **Debugging** - Inspect generated assets when something goes wrong
- 📚 **Archiving** - Keep a local copy of all your creations
- 🧪 **Testing** - Automated tests use this same system

## Demo Mode vs Test Mode

| Feature | Demo Mode | Test Mode |
|---------|-----------|-----------|
| **Purpose** | Run regular app + save artifacts | Automated E2E testing |
| **How to run** | `./backend/start_demo_mode.sh` | `./backend/test_pipeline_manual.sh` |
| **Use case** | Generate products via UI/API normally | Scripted create/edit flows |
| **Artifacts** | Saves everything you generate | Saves only test outputs |
| **Redis** | Keeps existing data | Flushes Redis before test |
| **Interactive** | Yes - use the full app | No - scripted only |

## Quick Start

### Method 1: Demo Mode Script (Easiest)

```bash
# From project root
./backend/start_demo_mode.sh

# Frontend at: http://localhost:3000
# Backend at: http://localhost:8000
# Artifacts at: backend/tests/artifacts/
```

### Method 2: Add to .env (Persistent)

```bash
# Add to backend/.env
echo "SAVE_ARTIFACTS_LOCALLY=true" >> backend/.env

# Restart backend
docker compose -f backend/docker-compose.yml restart
```

### Method 3: One-Time Enable

```bash
# Docker
SAVE_ARTIFACTS_LOCALLY=true docker compose -f backend/docker-compose.yml up

# OR Local development
cd backend
SAVE_ARTIFACTS_LOCALLY=true uvicorn main:app --reload
```

## What Gets Saved?

When you generate a product, you'll see new folders appear in `backend/tests/artifacts/`:

### Create Flow Artifacts

```
backend/tests/artifacts/
├── gemini_create_1764130000/           # Gemini images from create
│   ├── gemini_view_1.png
│   ├── gemini_view_2.png
│   └── gemini_view_3.png
└── trellis_create_1764130030/          # Trellis 3D assets from create
    ├── model.glb                       # 3D model (main output)
    ├── trellis_color.mp4               # Color render video
    ├── trellis_normal.mp4              # Normal map video
    ├── trellis_combined.mp4            # Combined video
    ├── state.json                      # Full session state
    └── no_background/
        ├── no_bg_1.png                 # No-background renders
        ├── no_bg_2.png
        └── no_bg_3.png
```

### Edit Flow Artifacts

```
backend/tests/artifacts/
├── gemini_edit_1764130200/             # Gemini images from edit
│   └── gemini_view_1.png
└── trellis_edit_1764130230/            # Trellis 3D assets from edit
    ├── model.glb
    ├── (same structure as create)
    └── state.json
```

## Artifact Timestamps

Folders are named with Unix timestamps, so they're automatically sorted chronologically:
- `gemini_create_1764130000` → Created on Nov 26, 2025 at specific time
- Later generations will have higher numbers

## Using state.json

Each Trellis folder includes a `state.json` file with the complete session state:

```json
{
  "prompt": "build a rubix cube",
  "latest_instruction": "lets make the colors only purple and white",
  "mode": "edit",
  "status": "complete",
  "iterations": [
    {
      "id": "iter_1764129641725",
      "type": "create",
      "prompt": "build a rubix cube",
      "trellis_output": {
        "model_file": "https://...",
        "color_video": "https://...",
        ...
      }
    },
    {
      "id": "iter_1764129810555",
      "type": "edit",
      "prompt": "lets make the colors only purple and white",
      ...
    }
  ]
}
```

This is useful for:
- Tracking what prompt generated what model
- Debugging generation issues
- Recreating specific generations

## Tips

1. **Clean up old artifacts** - The folder grows over time:
   ```bash
   # Remove artifacts older than 7 days
   find backend/tests/artifacts/ -type d -mtime +7 -exec rm -rf {} +
   ```

2. **Share artifacts** - All files are local, easy to share:
   ```bash
   # Zip recent artifacts
   cd backend/tests/artifacts/
   zip -r my_demo_$(date +%Y%m%d).zip gemini_* trellis_*
   ```

3. **Disable for production** - Demo mode is for dev/demo only:
   ```bash
   # Remove from .env for production
   SAVE_ARTIFACTS_LOCALLY=false  # or just remove the line
   ```

## Troubleshooting

### Artifacts not saving?

1. Check the flag is set:
   ```bash
   docker compose -f backend/docker-compose.yml exec fastapi_app env | grep SAVE_ARTIFACTS
   # Should show: SAVE_ARTIFACTS_LOCALLY=true
   ```

2. Check backend logs:
   ```bash
   docker compose -f backend/docker-compose.yml logs -f fastapi_app | grep artifact
   # Should see: "Saving X Gemini images to..." messages
   ```

3. Check folder permissions:
   ```bash
   ls -la backend/tests/
   # artifacts/ should be writable
   ```

### Where are my artifacts?

Always in `backend/tests/artifacts/` relative to project root:
```bash
cd /Users/cute/Documents/vsc/HW12
ls -lt backend/tests/artifacts/  # Most recent first
```

---

# Part 2: Demo Mock Mode (Full Presentation Mode)

**Skip real API calls entirely!** This mode simulates the loading UI with fake timings, then shows pre-generated content.

## What Mock Mode Does

1. **Create flow**: Shows loading progress (8 seconds), then displays your pre-seeded model
2. **Edit flow**: Shows loading progress (6 seconds), then displays your pre-seeded edited model
3. **No API calls**: Doesn't call Gemini or Trellis - perfect for offline demos or when APIs are flaky

## How to Enable

Add to `backend/.env`:
```bash
DEMO_MOCK_MODE=true
DEMO_CREATE_DELAY=8    # Customize loading time for create
DEMO_EDIT_DELAY=6      # Customize loading time for edit
```

## Setup Workflow

### Step 1: Generate Real Assets First (One Time)

With mock mode OFF, generate the assets you want to use:

```bash
# Make sure mock mode is OFF
DEMO_MOCK_MODE=false

# Start backend normally
cd backend && docker compose up -d

# Generate your demo product through the UI (real generation)
# 1. Create: "Einstein Funko Pop collectible figure"
# 2. Wait for it to complete
# 3. Export: curl http://localhost:8000/demo/export-current > create_export.json

# Then edit the product (real generation)
# 4. Edit: "Make it purple and white colors"
# 5. Wait for it to complete  
# 6. Export: curl http://localhost:8000/demo/export-current > edit_export.json
```

### Step 2: Update Fixtures File

Copy the URLs from your exports into `backend/demo_fixtures.json`:

```json
{
  "product_create": {
    "prompt": "Einstein Funko Pop collectible figure",
    "model_url": "https://v3b.fal.media/.../model.glb",
    "preview_images": ["data:image/png;base64,..."],
    "no_background_images": ["https://...png"],
    "trellis_images": [
      "@file:demo/data/create/create_hero.txt",
      "@file:demo/data/create/create_alt1.txt",
      "@file:demo/data/create/create_alt2.txt"
    ],
    "trellis_multi_image": true,
    "trellis_seed": 1337
  },
  "product_edit": {
    "prompt": "Make it purple and white colors",
    "model_url": "https://v3b.fal.media/.../edited_model.glb",
    "preview_images": ["data:image/png;base64,..."],
    "no_background_images": ["https://...png"],
    "trellis_images": ["@file:demo/data/edit/edit_view1.txt"],
    "trellis_multi_image": true,
    "trellis_seed": 1337
  },
  "packaging": { ... }
}
```

### Step 3: Enable Mock Mode

```bash
# Add to backend/.env
echo "DEMO_MOCK_MODE=true" >> backend/.env

# Rebuild and restart
cd backend && docker compose down && docker compose build && docker compose up -d
```

### Step 4: Demo Time!

Now when you:
1. **Create a product** → Shows loading for 8 seconds → Displays your pre-seeded model
2. **Edit the product** → Shows loading for 6 seconds → Displays your pre-seeded edited model

The UI looks exactly like real generation, but it's all pre-loaded!

## Check Mock Mode Status

```bash
curl http://localhost:8000/demo/mock-status
# Returns: {"demo_mock_mode": true, "create_delay_seconds": 8, ...}
```

---

# Part 3: Pre-Generate Images Externally

If you want to generate images outside the app (e.g., using AI Studio), here's how:

## Using Google AI Studio (Gemini)

1. Go to https://aistudio.google.com/
2. Select an image generation model (e.g., `gemini-2.0-flash-exp`)
3. Use this system prompt for product images:

```
You are a professional product photographer. Generate a high-quality product image.

REQUIREMENTS:
- Clean white or gradient background
- Professional studio lighting
- Sharp focus on the product
- Multiple angles showing the product from different views
- Photorealistic quality

OUTPUT:
- Single product on clean background
- High resolution
- Ready for 3D reconstruction
```

4. Enter your product description: "Einstein Funko Pop collectible figure"
5. Download the generated images
6. Convert to base64 data URL or host somewhere accessible

## Converting Image to Base64 Data URL

```bash
# On Mac/Linux
base64 -i your_image.png | tr -d '\n' | sed 's/^/data:image\/png;base64,/' > image_data_url.txt

# Then paste the contents into demo_fixtures.json
```

## Hosting Images (Alternative to Base64)

If images are too large for base64, host them:
- Upload to Imgur, Cloudinary, or your own server
- Use the direct image URL in fixtures
- Make sure URLs don't expire before your demo!

---

# Part 4: Trellis-Only Generation (Skip Gemini)

**Pre-generate images externally, then use Trellis for 3D conversion!**

This is perfect when:
- Gemini is unreliable/slow
- You want more control over the input images
- You're using a different AI for image generation

## API Endpoint

```bash
POST /product/trellis-only
```

**Request body:**
```json
{
  "prompt": "Einstein Funko Pop",
  "images": ["data:image/png;base64,..."],  // or URLs
  "mode": "create"  // or "edit"
}
```

## Method 1: Using the Helper Script

```bash
# From a local image file
./backend/scripts/trellis_from_image.sh ~/Downloads/einstein.png "Einstein Funko Pop"

# From a URL
./backend/scripts/trellis_from_image.sh https://example.com/image.png "Ceramic mug"
```

The script will:
1. Convert the image to base64 (if local file)
2. Send to Trellis-only endpoint
3. Poll for completion
4. Display the model URL when done

### Batch regeneration from fixtures (new)

If you maintain multiple demo angles inside `backend/demo_fixtures.json`, use the
dedicated helper in the `backend/demo` folder:

```bash
# Regenerate the create fixture using all configured Trellis images
python backend/demo/run_trellis_from_fixtures.py --target create

# Regenerate the edit fixture with the high quality preset
python backend/demo/run_trellis_from_fixtures.py --target edit --quality high_quality

# Or run both sequentially
python backend/demo/run_trellis_from_fixtures.py --target both
```

Populate the new `trellis_images` array inside each `product_*` section of
`demo_fixtures.json` with either:

- `@file:relative/path.txt` → file containing a data URL or raw image bytes
- `data:image/png;base64,...`
- `https://example.com/my-image.png`

Anything prefixed with `@file:` is resolved relative to `backend/`. Store the
raw JPEGs under `backend/demo/images/{create,edit}/` and the matching base64
data URLs under `backend/demo/data/{create,edit}/`. For example:

```
backend/demo/images/create/create_hero.jpeg   # UI preview asset
backend/demo/data/create/create_hero.txt      # data:image/... string used for Trellis
backend/demo/data/create/create_alt*.txt      # extra views fed to Trellis
```

This keeps binaries and data URLs separate, and you can point the fixtures’
`trellis_images` array at the `demo/data/...` files for consistent ingestion.
Edit fixtures can still use text placeholders (e.g. `backend/demo/data/edit/edit_view1.txt`)
until you drop in real renders.

The script calls `POST /trellis/generate` with all listed images, stores the raw
response under `backend/demo/<target>_trellis_result.json`, and updates
`demo_fixtures.json` with the new `model_url` + `no_background_images`. This
keeps your demo fixtures and regeneration workflow in sync.

## Method 2: Using curl Directly

### With a URL:
```bash
curl -X POST http://localhost:8000/product/trellis-only \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Einstein Funko Pop",
    "images": ["https://example.com/my-product-image.png"],
    "mode": "create"
  }'
```

### With base64 image:
```bash
# First convert image to base64
IMAGE_B64=$(base64 < ~/Downloads/product.png | tr -d '\n')

# Then send request
curl -X POST http://localhost:8000/product/trellis-only \
  -H "Content-Type: application/json" \
  -d "{
    \"prompt\": \"Einstein Funko Pop\",
    \"images\": [\"data:image/png;base64,${IMAGE_B64}\"],
    \"mode\": \"create\"
  }"
```

## Workflow for Demo Assets

### Step 1: Generate Images in AI Studio

1. Go to https://aistudio.google.com/
2. Use this prompt:
   ```
   Generate a professional product photograph of an Einstein Funko Pop collectible figure.
   
   Requirements:
   - Clean white background
   - Professional studio lighting
   - Sharp focus, photorealistic
   - Single product, centered
   - Ready for 3D reconstruction
   ```
3. Download the generated image

### Step 2: Run Trellis-Only

```bash
./backend/scripts/trellis_from_image.sh ~/Downloads/einstein.png "Einstein Funko Pop"
```

### Step 3: Export for Demo Fixtures

```bash
curl http://localhost:8000/demo/export-current | jq > my_create_fixtures.json
```

### Step 4: Repeat for Edit

1. Generate an "edited" version in AI Studio (e.g., purple/white colors)
2. Run Trellis-only with `mode: "edit"`
3. Export again

Now you have both create and edit models from pre-generated images!

---

# Part 5: Pre-Load Demo State (Seeding)

Skip generation during demos by pre-loading a product model and packaging textures!

## How It Works

1. **Generate once** - Create your demo product and packaging normally
2. **Export URLs** - Call `/demo/export-current` to get the URLs
3. **Save to fixtures** - Paste URLs into `demo_fixtures.json`
4. **Seed before demo** - Call `/demo/seed-from-fixtures` to load instantly

## Step-by-Step Setup

### Step 1: Generate Your Demo Assets

Generate a product and packaging you want to use for demos:

```bash
# 1. Start backend with demo mode (saves artifacts too)
./backend/start_demo_mode.sh

# 2. Use the UI to create your demo product and packaging
# 3. Wait for everything to generate
```

### Step 2: Export Current State

After generation completes, export the URLs:

```bash
curl http://localhost:8000/demo/export-current | jq
```

This returns something like:
```json
{
  "product": {
    "prompt": "Einstein Funko Pop",
    "model_url": "https://v3b.fal.media/files/..../model.glb",
    "preview_images": ["data:image/png;base64,..."],
    "no_background_images": ["https://....png"]
  },
  "packaging": {
    "package_type": "box",
    "dimensions": {"width": 100, "height": 150, "depth": 100},
    "panel_textures": {
      "front": {"texture_url": "data:image/png;base64,...", "prompt": "..."},
      "back": {"texture_url": "data:image/png;base64,...", "prompt": "..."}
    }
  }
}
```

### Step 3: Update Fixtures File

Copy the URLs into `backend/demo_fixtures.json`:

```json
{
  "product": {
    "prompt": "Einstein Funko Pop collectible figure",
    "model_url": "https://v3b.fal.media/files/.../model.glb",
    "preview_images": [...],
    "no_background_images": [...]
  },
  "packaging": {
    "package_type": "box",
    "dimensions": {"width": 100, "height": 150, "depth": 100},
    "panel_textures": {
      "front": {"texture_url": "...", "prompt": "..."},
      "back": {"texture_url": "...", "prompt": "..."},
      ...
    }
  }
}
```

### Step 4: Seed Before Demo

Before your presentation, load the fixtures:

```bash
curl -X POST http://localhost:8000/demo/seed-from-fixtures
```

That's it! Your product and packaging are now pre-loaded.

## Demo Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/demo/seed-product` | POST | Seed product with custom data |
| `/demo/seed-packaging` | POST | Seed packaging with custom data |
| `/demo/seed-from-fixtures` | POST | Load from `demo_fixtures.json` |
| `/demo/export-current` | GET | Export current state as fixture JSON |
| `/demo/clear` | POST | Clear all demo state |

## Quick Commands

```bash
# Before demo: Load fixtures
curl -X POST http://localhost:8000/demo/seed-from-fixtures

# Check product is loaded
curl http://localhost:8000/product | jq '.prompt, .trellis_output.model_file'

# Check packaging is loaded
curl http://localhost:8000/packaging | jq '.box_state.panel_textures | keys'

# Clear everything after demo
curl -X POST http://localhost:8000/demo/clear
```

## Demo Workflow Cheatsheet

```
📝 BEFORE DEMO DAY:
   1. Generate your best product + packaging
   2. curl http://localhost:8000/demo/export-current > my_demo.json
   3. Copy URLs to demo_fixtures.json
   4. Test: curl -X POST http://localhost:8000/demo/seed-from-fixtures

🎤 DEMO DAY:
   1. Start backend: docker compose up -d
   2. Seed state: curl -X POST http://localhost:8000/demo/seed-from-fixtures
   3. Start frontend: cd frontend && npm run dev
   4. Open http://localhost:3000 - everything is pre-loaded!
   
🧹 AFTER DEMO:
   1. curl -X POST http://localhost:8000/demo/clear
```

## Tips

### URL Expiration

- **fal.ai model URLs** - May expire after ~24 hours
- **Base64 data URLs** - Never expire (but are large)
- **Best practice**: Generate fresh fixtures the day before your demo

### Large Textures

If panel textures are base64 data URLs, the fixtures file will be large. That's okay - it ensures the textures never expire.

### Multiple Demo Configurations

Create multiple fixture files for different demos:

```bash
# Copy fixtures for different products
cp demo_fixtures.json demo_fixtures_funkopop.json
cp demo_fixtures.json demo_fixtures_mug.json

# Load a specific one
cat demo_fixtures_mug.json > demo_fixtures.json
curl -X POST http://localhost:8000/demo/seed-from-fixtures
```

---

## Related

- **Test Mode**: See `backend/test_pipeline_manual.sh` for automated E2E testing
- **Pytest Tests**: See `backend/tests/test_product_pipeline_e2e.py` for pytest-based tests
- **Configuration**: See `backend/app/core/config.py` for all settings

