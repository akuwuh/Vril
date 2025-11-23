from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    REPLICATE_API_KEY: Optional[str] = None
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Gemini - Image Generation (workflow-based model selection)
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_FLASH_MODEL: str = "gemini-2.5-flash-image"  # Fast, no thinking support
    GEMINI_PRO_MODEL: str = "gemini-3-pro-image-preview"  # Advanced, supports thinking
    GEMINI_THINKING_LEVEL: Optional[str] = "low"  # Applied to Pro model only
    GEMINI_IMAGE_SIZE: Optional[str] = "1K"  # Image resolution (1K, 2K, 4K for Pro)
    GEMINI_IMAGE_ASPECT_RATIO: Optional[str] = "1:1"  # Aspect ratio for generated images

    class Config:
        env_file = ".env"
        extra = "ignore"  # Allow extra fields in .env

settings = Settings()
