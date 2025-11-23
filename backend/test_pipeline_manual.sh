#!/bin/bash
# Manual end-to-end test script for product pipeline
# Usage: 
#   ./test_pipeline_manual.sh                    # Use default (gemini-3-pro-image-preview, 3 images)
#   USE_FLASH=1 ./test_pipeline_manual.sh        # Use gemini-2.5-flash-exp with 1K images (3 images)
#   QUICK=1 ./test_pipeline_manual.sh            # Quick test with 1 image only
#   TEST_EDIT=1 ./test_pipeline_manual.sh        # Test both create AND edit flows
#   USE_FLASH=1 QUICK=1 ./test_pipeline_manual.sh # Flash model with 1 image (fastest)

set -e

# Image count configuration
if [ "$QUICK" = "1" ]; then
  IMAGE_COUNT=1
  echo "⚡ QUICK MODE: Using 1 image only"
else
  IMAGE_COUNT=${IMAGE_COUNT:-3}
  echo "📸 Using $IMAGE_COUNT images"
fi

# Model configuration
if [ "$USE_FLASH" = "1" ]; then
  export GEMINI_IMAGE_MODEL="gemini-2.5-flash-exp"
  export GEMINI_IMAGE_SIZE="1K"
  export GEMINI_THINKING_LEVEL=""
  echo "🔧 Using Flash 2.5 model (1K images, no thinking)"
else
  export GEMINI_IMAGE_MODEL="${GEMINI_IMAGE_MODEL:-gemini-3-pro-image-preview}"
  export GEMINI_IMAGE_SIZE="${GEMINI_IMAGE_SIZE:-4K}"
  export GEMINI_THINKING_LEVEL="${GEMINI_THINKING_LEVEL:-low}"
  echo "🔧 Using Gemini 3 Pro model (${GEMINI_IMAGE_SIZE} images, thinking: ${GEMINI_THINKING_LEVEL})"
fi

# Restart backend with new env vars
echo "♻️  Restarting backend with updated config..."
docker compose -f backend/docker-compose.yml down
GEMINI_IMAGE_MODEL=$GEMINI_IMAGE_MODEL \
GEMINI_IMAGE_SIZE=$GEMINI_IMAGE_SIZE \
GEMINI_THINKING_LEVEL=$GEMINI_THINKING_LEVEL \
  docker compose -f backend/docker-compose.yml up -d fastapi_app

sleep 3

echo "🧹 Clearing Redis state..."
docker compose -f backend/docker-compose.yml exec redis redis-cli FLUSHDB

echo ""
echo "================================================================================"
echo "🧪 TEST 1: CREATE FLOW"
echo "================================================================================"
echo ""

echo "🚀 Starting /create flow with $IMAGE_COUNT image(s)..."
curl -X POST http://localhost:8000/product/create \
  -H "Content-Type: application/json" \
  -d "{\"prompt\": \"sleek reusable water bottle with engraved logo, hero product shot\", \"image_count\": $IMAGE_COUNT}" \
  | jq

echo ""
echo "⏳ Polling status every 5 seconds (Gemini takes ~30s, Trellis takes 3-5 min)..."
echo "Press Ctrl+C to stop polling"
echo ""

CREATE_START_TIME=$(date +%s)

while true; do
  STATUS=$(curl -s http://localhost:8000/product/status | jq -r '.status')
  PROGRESS=$(curl -s http://localhost:8000/product/status | jq -r '.progress')
  MESSAGE=$(curl -s http://localhost:8000/product/status | jq -r '.message')
  
  ELAPSED=$(($(date +%s) - CREATE_START_TIME))
  echo "[$(date +%H:%M:%S)] [${ELAPSED}s] Status: $STATUS | Progress: $PROGRESS% | $MESSAGE"
  
  if [ "$STATUS" = "complete" ] || [ "$STATUS" = "error" ]; then
    CREATE_TIME=$(($(date +%s) - CREATE_START_TIME))
    MINUTES=$((CREATE_TIME / 60))
    SECONDS=$((CREATE_TIME % 60))
    
    echo ""
    echo "================================================================================"
    if [ "$STATUS" = "complete" ]; then
      echo "✅ CREATE FLOW COMPLETE!"
    else
      echo "❌ CREATE FLOW FAILED!"
      exit 1
    fi
    echo "⏱️  Create time: ${CREATE_TIME}s (${MINUTES}m ${SECONDS}s)"
    echo "================================================================================"
    
    # Get product state
    PRODUCT_JSON=$(curl -s http://localhost:8000/product)
    MODEL_FILE=$(echo "$PRODUCT_JSON" | jq -r '.trellis_output.model_file // "none"')
    IMAGE_COUNT=$(echo "$PRODUCT_JSON" | jq -r '.images | length')
    
    echo ""
    echo "📦 GLB Model: ${MODEL_FILE:0:80}..."
    echo "🖼️  Images generated: $IMAGE_COUNT"
    echo ""
    break
  fi
  
  sleep 5
done

# Test edit flow if requested
if [ "$TEST_EDIT" = "1" ]; then
  echo ""
  echo "================================================================================"
  echo "🧪 TEST 2: EDIT FLOW"
  echo "================================================================================"
  echo ""
  
  echo "🚀 Starting /edit flow..."
  curl -X POST http://localhost:8000/product/edit \
    -H "Content-Type: application/json" \
    -d "{\"prompt\": \"add brushed aluminum accent ring and neon lighting details\"}" \
    | jq
  
  echo ""
  echo "⏳ Polling status for edit flow..."
  echo ""
  
  EDIT_START_TIME=$(date +%s)
  
  while true; do
    STATUS=$(curl -s http://localhost:8000/product/status | jq -r '.status')
    PROGRESS=$(curl -s http://localhost:8000/product/status | jq -r '.progress')
    MESSAGE=$(curl -s http://localhost:8000/product/status | jq -r '.message')
    
    ELAPSED=$(($(date +%s) - EDIT_START_TIME))
    echo "[$(date +%H:%M:%S)] [${ELAPSED}s] Status: $STATUS | Progress: $PROGRESS% | $MESSAGE"
    
    if [ "$STATUS" = "complete" ] || [ "$STATUS" = "error" ]; then
      EDIT_TIME=$(($(date +%s) - EDIT_START_TIME))
      MINUTES=$((EDIT_TIME / 60))
      SECONDS=$((EDIT_TIME % 60))
      
      echo ""
      echo "================================================================================"
      if [ "$STATUS" = "complete" ]; then
        echo "✅ EDIT FLOW COMPLETE!"
      else
        echo "❌ EDIT FLOW FAILED!"
        exit 1
      fi
      echo "⏱️  Edit time: ${EDIT_TIME}s (${MINUTES}m ${SECONDS}s)"
      echo "================================================================================"
      
      # Get updated product state
      PRODUCT_JSON=$(curl -s http://localhost:8000/product)
      MODEL_FILE=$(echo "$PRODUCT_JSON" | jq -r '.trellis_output.model_file // "none"')
      ITERATIONS=$(echo "$PRODUCT_JSON" | jq -r '.iterations | length')
      
      echo ""
      echo "📦 GLB Model: ${MODEL_FILE:0:80}..."
      echo "🔄 Total iterations: $ITERATIONS"
      echo ""
      break
    fi
    
    sleep 5
  done
  
  TOTAL_TIME=$((CREATE_TIME + EDIT_TIME))
  TOTAL_MINUTES=$((TOTAL_TIME / 60))
  TOTAL_SECONDS=$((TOTAL_TIME % 60))
  
  echo ""
  echo "================================================================================"
  echo "🎉 ALL TESTS COMPLETE!"
  echo "⏱️  Total time: ${TOTAL_TIME}s (${TOTAL_MINUTES}m ${TOTAL_SECONDS}s)"
  echo "    - Create: ${CREATE_TIME}s"
  echo "    - Edit: ${EDIT_TIME}s"
  echo "📁 Artifacts saved to:"
  ls -ltrh backend/tests/artifacts/ | tail -5
  echo "================================================================================"
else
  echo ""
  echo "📁 Artifacts saved to:"
  ls -ltrh backend/tests/artifacts/ | tail -5
  echo ""
  echo "================================================================================"
  echo "💡 Tip: Run with TEST_EDIT=1 to also test the edit flow"
  echo "================================================================================"
fi

