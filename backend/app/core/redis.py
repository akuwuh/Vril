"""Redis client wrapper that prefers a hosted REDIS_URL with in-memory fallback."""

from __future__ import annotations

import json
import logging
import os

import redis
from redis.exceptions import RedisError

from app.core.config import settings

# Default to local Redis instance
_DEFAULT_REDIS_URL = "redis://127.0.0.1:6379/0"


def _resolve_redis_url() -> str:
    """Determine the Redis connection string from environment, settings, or default."""
    env_url = os.getenv("REDIS_URL")
    settings_url = getattr(settings, "REDIS_URL", None)
    return env_url or settings_url or _DEFAULT_REDIS_URL


def get_redis_url() -> str:
    """Public helper for retrieving the active Redis connection URL."""
    return _resolve_redis_url()


logger = logging.getLogger(__name__)


class RedisService:
    """Thin Redis client with graceful degradation to an in-memory store."""

    def __init__(self, redis_url: str | None = None):
        self._url = redis_url or _resolve_redis_url()
        self.client = self._create_client(self._url)
        self._fallback_store: dict[str, str] = {}
        self._use_fallback = False

    @staticmethod
    def _create_client(redis_url: str) -> redis.Redis:
        return redis.from_url(redis_url, decode_responses=True)

    def get(self, key: str) -> str | None:
        try:
            if self._use_fallback:
                return self._fallback_store.get(key)
            return self.client.get(key)
        except RedisError:
            self._use_fallback = True
            return self._fallback_store.get(key)

    def set(self, key: str, value: str, ex: int | None = None) -> bool:
        try:
            if self._use_fallback:
                self._fallback_store[key] = value
                return True
            return self.client.set(key, value, ex=ex)
        except RedisError:
            self._use_fallback = True
            self._fallback_store[key] = value
            return True

    def set_json(self, key: str, value: object, ex: int | None = None) -> bool:
        """Serialize value to JSON before storing."""
        payload = json.dumps(value, ensure_ascii=False)
        return self.set(key, payload, ex=ex)

    def setex(self, key: str, time: int, value: str) -> bool:
        """Set key with expiration time; fallback ignores expiry."""
        try:
            if self._use_fallback:
                self._fallback_store[key] = value
                return True
            return self.client.setex(key, time, value)
        except RedisError:
            self._use_fallback = True
            self._fallback_store[key] = value
            return True

    def delete(self, key: str) -> int:
        if self._use_fallback:
            return 1 if self._fallback_store.pop(key, None) is not None else 0
        try:
            return self.client.delete(key)
        except RedisError:
            self._use_fallback = True
            return 1 if self._fallback_store.pop(key, None) is not None else 0

    def get_json(self, key: str, default: object | None = None) -> object | None:
        """Return JSON-decoded payload with graceful fallback."""
        raw_value = self.get(key)
        if raw_value is None:
            return default
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            logger.warning("Failed to decode JSON for key %s", key)
            return default

    def exists(self, key: str) -> bool:
        if self._use_fallback:
            return key in self._fallback_store
        try:
            return self.client.exists(key) > 0
        except RedisError:
            self._use_fallback = True
            return key in self._fallback_store

    def ping(self) -> bool:
        try:
            if self._use_fallback:
                return True
            return self.client.ping()
        except RedisError:
            self._use_fallback = True
            return True

    def keys(self, pattern: str) -> list[str]:
        """Get keys matching pattern."""
        try:
            if self._use_fallback:
                import fnmatch
                return [k for k in self._fallback_store.keys() if fnmatch.fnmatch(k, pattern)]
            return self.client.keys(pattern)
        except RedisError:
            self._use_fallback = True
            import fnmatch
            return [k for k in self._fallback_store.keys() if fnmatch.fnmatch(k, pattern)]
    
    def incr(self, key: str, amount: int = 1) -> int:
        """Increment key by amount."""
        try:
            if self._use_fallback:
                current = int(self._fallback_store.get(key, 0))
                new_val = current + amount
                self._fallback_store[key] = str(new_val)
                return new_val
            return self.client.incr(key, amount)
        except RedisError:
            self._use_fallback = True
            current = int(self._fallback_store.get(key, 0))
            new_val = current + amount
            self._fallback_store[key] = str(new_val)
            return new_val
    
    def expire(self, key: str, time: int) -> bool:
        """Set expiration on key (ignored in fallback)."""
        try:
            if self._use_fallback:
                return True  # Fallback doesn't support expiration
            return self.client.expire(key, time)
        except RedisError:
            self._use_fallback = True
            return True

    def flushdb(self) -> bool:
        """Clear stored keys for the active database or fallback store."""
        try:
            if self._use_fallback:
                self._fallback_store.clear()
                return True
            return self.client.flushdb()
        except RedisError:
            self._use_fallback = True
            self._fallback_store.clear()
            return True


redis_service = RedisService()

