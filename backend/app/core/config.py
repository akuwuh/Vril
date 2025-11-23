from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    REPLICATE_API_KEY: Optional[str] = None
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Gemini
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-pro-002"
    GEMINI_FLASH_MODEL: str = "gemini-2.5-flash-image" # Updated to latest available or stick to 1.5-flash
    GEMINI_TEMPERATURE: float = 0.7
    GEMINI_MAX_TOKENS: int = 2048
    GEMINI_MAX_RETRIES: int = 3
    GEMINI_IMAGE_MODEL: str = "gemini-3-pro-image-preview"
    GEMINI_THINKING_LEVEL: Optional[str] = None
    GEMINI_IMAGE_SIZE: Optional[str] = "1K"
    GEMINI_IMAGE_ASPECT_RATIO: Optional[str] = "1:1"

    class Config:
        env_file = ".env"
        extra = "ignore"  # Allow extra fields in .env

settings = Settings()
