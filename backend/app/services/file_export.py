"""File export service for generating various file formats from product and packaging data."""

import logging
import math
import os
import tempfile
import urllib.request
from pathlib import Path
from typing import Dict, Optional, Tuple

import trimesh
from PIL import Image
import cairosvg
import io

from app.models.packaging_state import PackagingState
from app.models.product_state import ProductState

logger = logging.getLogger(__name__)

# Directory for storing exported files temporarily
EXPORT_DIR = Path(tempfile.gettempdir()) / "hw12_exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def _download_glb(url: str) -> bytes:
    """Download GLB file from URL."""
    logger.info(f"[file-export] Downloading GLB from {url[:80]}...")
    with urllib.request.urlopen(url) as response:
        return response.read()


def _load_glb_mesh(glb_data: bytes) -> trimesh.Scene:
    """Load GLB data into trimesh Scene."""
    return trimesh.load(io.BytesIO(glb_data), file_type="glb")


def _export_stl(mesh: trimesh.Scene, output_path: Path) -> None:
    """Export mesh to STL format."""
    # Combine all meshes in the scene
    combined = trimesh.util.concatenate([m for m in mesh.geometry.values() if isinstance(m, trimesh.Trimesh)])
    combined.export(str(output_path), file_type="stl")
    logger.info(f"[file-export] Exported STL to {output_path}")


def _export_obj(mesh: trimesh.Scene, output_path: Path) -> None:
    """Export mesh to OBJ format (can be imported into Blender)."""
    mesh.export(str(output_path), file_type="obj")
    logger.info(f"[file-export] Exported OBJ to {output_path}")


def _render_jpg(scene: trimesh.Scene, output_path: Path, resolution: Tuple[int, int] = (2048, 2048)) -> None:
    """Render scene to JPG image."""
    try:
        # Check if scene has geometry
        if not scene.geometry:
            logger.warning(f"[file-export] Scene has no geometry, creating placeholder image")
            _create_placeholder_image(output_path, resolution, "No geometry")
            return

        # Try to render the scene using trimesh (requires pyglet)
        try:
            png_data = scene.save_image(resolution=resolution)

            if png_data and len(png_data) > 0:
                # Convert PNG to JPG
                img = Image.open(io.BytesIO(png_data))
                rgb_img = img.convert("RGB")
                rgb_img.save(output_path, "JPEG", quality=95)
                logger.info(f"[file-export] Rendered JPG to {output_path}")
                return
        except ImportError as e:
            if "pyglet" in str(e):
                logger.info(f"[file-export] pyglet not available, using alternative rendering")
            else:
                raise

        # Fallback: create a simple 2D representation
        _create_scene_thumbnail(scene, output_path, resolution)

    except Exception as e:
        logger.warning(f"[file-export] Failed to render JPG, creating placeholder: {e}")
        _create_placeholder_image(output_path, resolution, "Render failed")


def _create_scene_thumbnail(scene: trimesh.Scene, output_path: Path, resolution: Tuple[int, int]) -> None:
    """Create a simple 2D thumbnail representation of the 3D scene."""
    from PIL import ImageDraw

    img = Image.new("RGB", resolution, color=(240, 240, 240))
    draw = ImageDraw.Draw(img)

    # Get scene bounds
    bounds = scene.bounds
    if bounds is not None:
        center = (bounds[0] + bounds[1]) / 2
        size = bounds[1] - bounds[0]
        max_dim = max(size)

        # Draw a simple wireframe box representing the scene bounds
        box_center = (resolution[0] // 2, resolution[1] // 2)
        box_size = min(resolution) // 4

        # Draw a 3D-like box
        draw.rectangle([
            box_center[0] - box_size, box_center[1] - box_size,
            box_center[0] + box_size, box_center[1] + box_size
        ], outline=(100, 100, 100), width=2)

        # Add some 3D effect lines
        draw.line([
            box_center[0] - box_size, box_center[1] - box_size,
            box_center[0] - box_size//2, box_center[1] - box_size//2 - 20
        ], fill=(150, 150, 150), width=2)

        draw.line([
            box_center[0] + box_size, box_center[1] - box_size,
            box_center[0] + box_size//2 + 20, box_center[1] - box_size//2 - 20
        ], fill=(150, 150, 150), width=2)

    # Add text
    try:
        # Try to use a default font, fallback if not available
        draw.text((10, 10), f"3D Model ({len(scene.geometry)} objects)", fill=(0, 0, 0))
        draw.text((10, resolution[1] - 30), "JPG Preview", fill=(100, 100, 100))
    except:
        pass  # Skip text if font issues

    img.save(output_path, "JPEG", quality=95)
    logger.info(f"[file-export] Created thumbnail JPG to {output_path}")


def _create_placeholder_image(output_path: Path, resolution: Tuple[int, int], message: str) -> None:
    """Create a placeholder image with a message."""
    from PIL import ImageDraw

    img = Image.new("RGB", resolution, color=(200, 200, 200))
    draw = ImageDraw.Draw(img)

    # Draw a border
    draw.rectangle([10, 10, resolution[0]-10, resolution[1]-10], outline=(100, 100, 100), width=2)

    # Add message
    try:
        bbox = draw.textbbox((0, 0), message)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        x = (resolution[0] - text_width) // 2
        y = (resolution[1] - text_height) // 2
        draw.text((x, y), message, fill=(50, 50, 50))
    except:
        pass  # Skip text if font issues

    img.save(output_path, "JPEG", quality=95)


def _create_box_mesh(dimensions: Dict[str, float]) -> trimesh.Trimesh:
    """Create a box mesh from dimensions (in mm)."""
    width = dimensions.get("width", 100.0) / 1000.0  # Convert mm to meters
    height = dimensions.get("height", 150.0) / 1000.0
    depth = dimensions.get("depth", 100.0) / 1000.0
    
    return trimesh.creation.box(extents=[width, height, depth])


def _create_cylinder_mesh(dimensions: Dict[str, float]) -> trimesh.Trimesh:
    """Create a cylinder mesh from dimensions (in mm)."""
    radius = (dimensions.get("width", 80.0) / 1000.0) / 2.0  # Convert mm to meters, then radius
    height = dimensions.get("height", 150.0) / 1000.0
    
    return trimesh.creation.cylinder(radius=radius, height=height, sections=32)


def _generate_dieline_svg(packaging_state: PackagingState) -> str:
    """Generate SVG string from dieline paths (matches frontend logic)."""
    package_type = packaging_state.current_package_type
    shape_state = packaging_state.cylinder_state if package_type == "cylinder" else packaging_state.box_state
    dimensions = shape_state.dimensions
    
    paths = []
    
    if package_type == "box":
        width = dimensions.get("width", 100.0)
        height = dimensions.get("height", 150.0)
        depth = dimensions.get("depth", 100.0)
        
        margin = 20.0
        
        # Top panel (above front)
        top_points = [
            (margin + depth, margin),
            (margin + depth + width, margin),
            (margin + depth + width, margin + depth),
            (margin + depth, margin + depth),
        ]
        top_path = "M {} {} L {} {} L {} {} L {} {} Z".format(*[p for pair in top_points for p in pair])
        paths.append(f'<path d="{top_path}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Left panel
        left_points = [
            (margin, margin + depth),
            (margin + depth, margin + depth),
            (margin + depth, margin + depth + height),
            (margin, margin + depth + height),
        ]
        left_path = "M {} {} L {} {} L {} {} L {} {} Z".format(*[p for pair in left_points for p in pair])
        paths.append(f'<path d="{left_path}" fill="none" stroke="#10b981" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Front panel (center)
        front_points = [
            (margin + depth, margin + depth),
            (margin + depth + width, margin + depth),
            (margin + depth + width, margin + depth + height),
            (margin + depth, margin + depth + height),
        ]
        front_path = "M {} {} L {} {} L {} {} L {} {} Z".format(*[p for pair in front_points for p in pair])
        paths.append(f'<path d="{front_path}" fill="none" stroke="#10b981" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Right panel
        right_points = [
            (margin + depth + width, margin + depth),
            (margin + depth + width + depth, margin + depth),
            (margin + depth + width + depth, margin + depth + height),
            (margin + depth + width, margin + depth + height),
        ]
        right_path = "M {} {} L {} {} L {} {} L {} {} Z".format(*[p for pair in right_points for p in pair])
        paths.append(f'<path d="{right_path}" fill="none" stroke="#10b981" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Back panel
        back_points = [
            (margin + depth + width + depth, margin + depth),
            (margin + depth + width + depth + width, margin + depth),
            (margin + depth + width + depth + width, margin + depth + height),
            (margin + depth + width + depth, margin + depth + height),
        ]
        back_path = "M {} {} L {} {} L {} {} L {} {} Z".format(*[p for pair in back_points for p in pair])
        paths.append(f'<path d="{back_path}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Bottom panel (below front)
        bottom_points = [
            (margin + depth, margin + depth + height),
            (margin + depth + width, margin + depth + height),
            (margin + depth + width, margin + depth + height + depth),
            (margin + depth, margin + depth + height + depth),
        ]
        bottom_path = "M {} {} L {} {} L {} {} L {} {} Z".format(*[p for pair in bottom_points for p in pair])
        paths.append(f'<path d="{bottom_path}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Calculate bounds
        max_x = margin + depth + width + depth + width
        max_y = margin + depth + height + depth
        view_box = f"0 0 {max_x + margin} {max_y + margin}"
        
    else:  # cylinder
        width = dimensions.get("width", 80.0)
        height = dimensions.get("height", 150.0)
        
        margin = 10.0
        circumference = math.pi * width
        
        # Body wrap
        body_points = [
            (margin, margin + width / 2),
            (margin + circumference, margin + width / 2),
            (margin + circumference, margin + width / 2 + height),
            (margin, margin + width / 2 + height),
        ]
        body_path = "M {} {} L {} {} L {} {} L {} {} Z".format(*[p for pair in body_points for p in pair])
        paths.append(f'<path d="{body_path}" fill="none" stroke="#10b981" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Top circle (approximated with octagon)
        top_center_x = margin + circumference / 2
        top_center_y = margin
        top_circle_points = []
        for i in range(8):
            angle = (i * math.pi * 2) / 8
            x = top_center_x + math.cos(angle) * (width / 2)
            y = top_center_y + math.sin(angle) * (width / 2)
            top_circle_points.append((x, y))
        
        top_circle_path = "M {} {}".format(*top_circle_points[0])
        for point in top_circle_points[1:]:
            top_circle_path += f" L {point[0]} {point[1]}"
        top_circle_path += " Z"
        paths.append(f'<path d="{top_circle_path}" fill="none" stroke="#10b981" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Bottom circle
        bottom_center_x = margin + circumference / 2
        bottom_center_y = margin + width / 2 + height + width / 2
        bottom_circle_points = []
        for i in range(8):
            angle = (i * math.pi * 2) / 8
            x = bottom_center_x + math.cos(angle) * (width / 2)
            y = bottom_center_y + math.sin(angle) * (width / 2)
            bottom_circle_points.append((x, y))
        
        bottom_circle_path = "M {} {}".format(*bottom_circle_points[0])
        for point in bottom_circle_points[1:]:
            bottom_circle_path += f" L {point[0]} {point[1]}"
        bottom_circle_path += " Z"
        paths.append(f'<path d="{bottom_circle_path}" fill="none" stroke="#94a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>')
        
        # Calculate bounds
        max_x = margin + circumference
        max_y = bottom_center_y + width / 2
        view_box = f"0 0 {max_x + margin} {max_y + margin}"
    
    svg_content = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="600" viewBox="{view_box}" xmlns="http://www.w3.org/2000/svg">
  {chr(10).join("  " + p for p in paths)}
</svg>'''
    
    return svg_content


def export_product_formats(product_state: ProductState, session_id: str) -> Dict[str, Path]:
    """Generate product export files: blend (as OBJ), stl, jpg.
    
    Returns dict mapping format -> file path.
    """
    if not product_state.trellis_output or not product_state.trellis_output.model_file:
        raise ValueError("No product model available for export")
    
    glb_url = product_state.trellis_output.model_file
    glb_data = _download_glb(glb_url)
    mesh = _load_glb_mesh(glb_data)
    
    export_files = {}
    base_path = EXPORT_DIR / f"product_{session_id}"
    
    # Export STL
    stl_path = base_path.with_suffix(".stl")
    _export_stl(mesh, stl_path)
    export_files["stl"] = stl_path
    
    # Export OBJ (for Blender import - note: not .blend but importable)
    obj_path = base_path.with_suffix(".obj")
    _export_obj(mesh, obj_path)
    export_files["blend"] = obj_path  # Store as "blend" but it's OBJ format
    
    # Export JPG
    jpg_path = base_path.with_suffix(".jpg")
    _render_jpg(mesh, jpg_path)
    export_files["jpg"] = jpg_path
    
    return export_files


def export_package_formats(packaging_state: PackagingState, session_id: str) -> Dict[str, Path]:
    """Generate package export files: blend (as OBJ), stl, jpg.
    
    Returns dict mapping format -> file path.
    """
    package_type = packaging_state.current_package_type
    shape_state = packaging_state.cylinder_state if package_type == "cylinder" else packaging_state.box_state
    dimensions = shape_state.dimensions
    
    # Create mesh from dimensions
    if package_type == "box":
        mesh = _create_box_mesh(dimensions)
    else:  # cylinder
        mesh = _create_cylinder_mesh(dimensions)
    
    # Convert to Scene for consistency
    scene = trimesh.Scene([mesh])
    
    export_files = {}
    base_path = EXPORT_DIR / f"package_{session_id}"
    
    # Export STL
    stl_path = base_path.with_suffix(".stl")
    _export_stl(scene, stl_path)
    export_files["stl"] = stl_path
    
    # Export OBJ (for Blender import)
    obj_path = base_path.with_suffix(".obj")
    _export_obj(scene, obj_path)
    export_files["blend"] = obj_path  # Store as "blend" but it's OBJ format
    
    # Export JPG
    jpg_path = base_path.with_suffix(".jpg")
    _render_jpg(scene, jpg_path)
    export_files["jpg"] = jpg_path
    
    return export_files


def export_dieline_formats(packaging_state: PackagingState, session_id: str) -> Dict[str, Path]:
    """Generate dieline export files: pdf, svg, jpg.
    
    Returns dict mapping format -> file path.
    """
    svg_content = _generate_dieline_svg(packaging_state)
    
    export_files = {}
    base_path = EXPORT_DIR / f"dieline_{session_id}"
    
    # Export SVG
    svg_path = base_path.with_suffix(".svg")
    svg_path.write_text(svg_content, encoding="utf-8")
    export_files["svg"] = svg_path
    
    # Export PDF
    pdf_path = base_path.with_suffix(".pdf")
    try:
        cairosvg.svg2pdf(bytestring=svg_content.encode("utf-8"), write_to=str(pdf_path))
        logger.info(f"[file-export] Exported PDF to {pdf_path}")
    except Exception as e:
        logger.error(f"[file-export] Failed to export PDF: {e}")
        raise
    
    # Export JPG
    jpg_path = base_path.with_suffix(".jpg")
    try:
        png_data = cairosvg.svg2png(bytestring=svg_content.encode("utf-8"))
        img = Image.open(io.BytesIO(png_data))
        rgb_img = img.convert("RGB")
        rgb_img.save(jpg_path, "JPEG", quality=95)
        logger.info(f"[file-export] Exported JPG to {jpg_path}")
    except Exception as e:
        logger.error(f"[file-export] Failed to export JPG: {e}")
        raise
    
    export_files["pdf"] = pdf_path
    export_files["jpg"] = jpg_path
    
    return export_files


def get_export_file_path(session_id: str, file_type: str, format: str) -> Optional[Path]:
    """Get path to exported file if it exists."""
    prefix_map = {
        "product": "product",
        "package": "package",
        "dieline": "dieline",
    }
    
    prefix = prefix_map.get(file_type)
    if not prefix:
        return None
    
    base_path = EXPORT_DIR / f"{prefix}_{session_id}"
    
    # Handle special case: "blend" format is actually OBJ
    ext = ".obj" if format == "blend" else f".{format}"
    file_path = base_path.with_suffix(ext)
    
    if file_path.exists():
        return file_path
    
    return None

