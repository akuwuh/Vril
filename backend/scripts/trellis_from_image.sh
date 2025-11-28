#!/bin/bash
# Generate 3D model from a pre-generated image using Trellis-only endpoint
#
# Usage:
#   ./scripts/trellis_from_image.sh /path/to/image.png "Product description"
#   ./scripts/trellis_from_image.sh https://example.com/image.png "Product description"
#
# Examples:
#   ./scripts/trellis_from_image.sh ~/Downloads/einstein.png "Einstein Funko Pop"
#   ./scripts/trellis_from_image.sh https://imgur.com/abc123.png "Ceramic mug"

set -e

API_BASE="${API_BASE:-http://localhost:8000}"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <image_path_or_url> <prompt>"
    echo ""
    echo "Examples:"
    echo "  $0 ~/Downloads/product.png 'Einstein Funko Pop collectible figure'"
    echo "  $0 https://example.com/image.png 'Ceramic coffee mug'"
    exit 1
fi

IMAGE_INPUT="$1"
PROMPT="$2"
MODE="${3:-create}"

echo "🎨 Trellis-Only 3D Generation"
echo "================================"
echo "Image: $IMAGE_INPUT"
echo "Prompt: $PROMPT"
echo "Mode: $MODE"
echo ""

# Check if it's a URL or a file path
if [[ "$IMAGE_INPUT" == http* ]]; then
    # It's a URL - use directly
    IMAGE_DATA="$IMAGE_INPUT"
    echo "📡 Using image URL directly"
else
    # It's a file - convert to base64
    if [ ! -f "$IMAGE_INPUT" ]; then
        echo "❌ Error: File not found: $IMAGE_INPUT"
        exit 1
    fi
    
    echo "📦 Converting image to base64..."
    
    # Detect mime type
    if [[ "$IMAGE_INPUT" == *.png ]]; then
        MIME="image/png"
    elif [[ "$IMAGE_INPUT" == *.jpg ]] || [[ "$IMAGE_INPUT" == *.jpeg ]]; then
        MIME="image/jpeg"
    elif [[ "$IMAGE_INPUT" == *.webp ]]; then
        MIME="image/webp"
    else
        MIME="image/png"
    fi
    
    # Convert to base64 data URL
    BASE64=$(base64 < "$IMAGE_INPUT" | tr -d '\n')
    IMAGE_DATA="data:${MIME};base64,${BASE64}"
    
    echo "✅ Image converted (${#BASE64} chars)"
fi

echo ""
echo "🚀 Sending to Trellis..."
echo ""

# Create JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
    "prompt": "$PROMPT",
    "images": ["$IMAGE_DATA"],
    "mode": "$MODE"
}
EOF
)

# Send request
RESPONSE=$(curl -s -X POST "$API_BASE/product/trellis-only" \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD")

echo "Response: $RESPONSE"
echo ""

# Poll for completion
echo "⏳ Polling for completion..."
echo ""

while true; do
    STATUS_JSON=$(curl -s "$API_BASE/product/status")
    STATUS=$(echo "$STATUS_JSON" | jq -r '.status')
    PROGRESS=$(echo "$STATUS_JSON" | jq -r '.progress')
    MESSAGE=$(echo "$STATUS_JSON" | jq -r '.message')
    
    echo "[$(date +%H:%M:%S)] Status: $STATUS | Progress: $PROGRESS% | $MESSAGE"
    
    if [ "$STATUS" = "complete" ]; then
        echo ""
        echo "✅ 3D MODEL GENERATED!"
        echo ""
        MODEL_URL=$(echo "$STATUS_JSON" | jq -r '.model_file')
        echo "📦 Model URL: $MODEL_URL"
        echo ""
        
        # Get full state
        echo "📋 Full product state:"
        curl -s "$API_BASE/product" | jq '{prompt, status, model_file: .trellis_output.model_file}'
        break
    fi
    
    if [ "$STATUS" = "error" ]; then
        echo ""
        echo "❌ ERROR: $MESSAGE"
        exit 1
    fi
    
    sleep 3
done

echo ""
echo "🎉 Done! Open http://localhost:3000 to view your 3D model."


