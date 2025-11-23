"""Service layer helpers."""

# Make product_pipeline optional since it requires dependencies
try:
    from .product_pipeline import ProductPipelineService, product_pipeline_service  # noqa: F401
except ImportError:
    pass  # Product pipeline not available


