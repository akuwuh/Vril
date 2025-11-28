#!/usr/bin/env python3
"""
Utility script to regenerate Trellis models for demo fixtures using the
pre-configured reference images in backend/demo_fixtures.json.

Usage:
    python backend/demo/run_trellis_from_fixtures.py --target create
    python backend/demo/run_trellis_from_fixtures.py --target edit
    python backend/demo/run_trellis_from_fixtures.py --target both --quality high_quality

Notes:
- Image entries inside demo_fixtures.json can be:
    * data URLs (data:image/png;base64,...)
    * HTTP(S) URLs
    * File references prefixed with "@file:" (relative to backend/). These files
      can contain a data URL OR binary image data (.png/.jpg/.jpeg/.webp).
- The script updates demo_fixtures.json with the new model URL and stores the
  raw Trellis response under backend/demo/<target>_trellis_result.json.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import sys
import time
from pathlib import Path
from typing import Iterable, List, Optional

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]  # backend/
FIXTURES_PATH = REPO_ROOT / "demo_fixtures.json"
DEMO_DIR = REPO_ROOT / "demo"


def load_fixtures() -> dict:
    if not FIXTURES_PATH.exists():
        raise FileNotFoundError(f"Fixtures file not found: {FIXTURES_PATH}")
    return json.loads(FIXTURES_PATH.read_text())


def guess_mime(path: Path) -> str:
    mime, _ = mimetypes.guess_type(path.name)
    return mime or "image/png"


def read_binary_as_data_url(path: Path) -> str:
    mime = guess_mime(path)
    encoded = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{encoded}"


def resolve_image_spec(spec: str) -> Optional[str]:
    spec = spec.strip()
    if not spec:
        return None
    if spec.startswith("@file:"):
        rel_path = spec.split(":", 1)[1].strip()
        file_path = (REPO_ROOT / rel_path).resolve()
        if not file_path.exists():
            print(f"⚠️  Skipping missing file: {rel_path}")
            return None

        if file_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            return read_binary_as_data_url(file_path)

        # Treat everything else as text (expected to contain a data URL)
        contents = file_path.read_text().strip()
        if not contents or contents.startswith("#") or contents.startswith("PASTE"):
            print(f"⚠️  File {rel_path} does not contain a valid image payload. Skipping.")
            return None
        return contents

    return spec  # Already a URL or data URL


def resolve_images(specs: Iterable[str]) -> List[str]:
    resolved = []
    for spec in specs:
        image = resolve_image_spec(spec)
        if image:
            resolved.append(image)
    return resolved


def save_fixtures(fixtures: dict) -> None:
    FIXTURES_PATH.write_text(json.dumps(fixtures, indent=2))


def run_generation(target: str, api_base: str, quality_override: Optional[str]) -> None:
    fixtures = load_fixtures()
    key = "product_create" if target == "create" else "product_edit"
    section = fixtures.get(key)
    if not section:
        print(f"❌ No section '{key}' found in fixtures.")
        return

    image_specs = section.get("trellis_images") or []
    images = resolve_images(image_specs)
    if not images:
        print(f"❌ No valid Trellis images configured for {key}.")
        return

    quality = quality_override or section.get("trellis_quality") or "balanced"
    seed = section.get("trellis_seed", 1337)
    multi_flag = section.get("trellis_multi_image")
    use_multi = multi_flag if multi_flag is not None else len(images) > 1
    multi_algo = section.get("trellis_multiimage_algo", "stochastic")

    payload = {
        "images": images,
        "quality": quality,
        "seed": seed,
        "use_multi_image": use_multi,
    }
    if use_multi:
        payload["multiimage_algo"] = multi_algo

    print(f"🚀 Sending {len(images)} image(s) to Trellis ({quality})...")
    response = requests.post(f"{api_base}/trellis/generate", json=payload, timeout=120)
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        print(f"❌ Trellis request failed: {exc}\n{response.text}")
        return

    result = response.json()
    result_file = DEMO_DIR / f"{target}_trellis_result.json"
    result_file.write_text(json.dumps(result, indent=2))
    print(f"✅ Trellis response saved to {result_file.relative_to(REPO_ROOT.parent)}")

    model_file = result.get("model_file")
    if model_file:
        section["model_url"] = model_file
        print(f"📦 Updated model_url for {key}: {model_file}")
    if "no_background_images" in result:
        section["no_background_images"] = result.get("no_background_images") or []
    section["trellis_last_generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    save_fixtures(fixtures)
    print("💾 demo_fixtures.json updated.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Regenerate Trellis models from demo fixtures.")
    parser.add_argument(
        "--target",
        choices=["create", "edit", "both"],
        default="create",
        help="Which fixture to regenerate.",
    )
    parser.add_argument(
        "--api-base",
        default="http://localhost:8000",
        help="Base URL for the backend API.",
    )
    parser.add_argument(
        "--quality",
        choices=["balanced", "high_quality"],
        default=None,
        help="Override the Trellis quality preset.",
    )
    args = parser.parse_args()

    targets = ["create", "edit"] if args.target == "both" else [args.target]
    for target in targets:
        run_generation(target, args.api_base.rstrip("/"), args.quality)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)

