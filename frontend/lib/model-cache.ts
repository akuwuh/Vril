const CACHE_NAME = "product-models";

// In-memory cache of iteration ID -> blob URL to avoid creating duplicates
const blobUrlCache = new Map<string, string>();

export async function getCachedModelUrl(iterationId: string, remoteUrl: string) {
  if (typeof window === "undefined" || !("caches" in window)) {
    return remoteUrl;
  }

  // Use both iterationId AND URL hash for cache key to prevent stale data
  // This ensures when the model URL changes, we fetch the new one
  const urlHash = await hashString(remoteUrl);
  const cacheKey = `model_glb_${iterationId}_${urlHash}`;

  // Check in-memory cache first to reuse existing blob URL
  if (blobUrlCache.has(cacheKey)) {
    return blobUrlCache.get(cacheKey)!;
  }

  const cache = await caches.open(CACHE_NAME);

  const cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    const blob = await cachedResponse.blob();
    const blobUrl = URL.createObjectURL(blob);
    blobUrlCache.set(cacheKey, blobUrl);
    return blobUrl;
  }

  const response = await fetch(remoteUrl, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.status}`);
  }

  await cache.put(cacheKey, response.clone());
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(cacheKey, blobUrl);
  return blobUrl;
}

// Simple hash function for URLs to create unique cache keys
async function hashString(str: string): Promise<string> {
  if (typeof window === "undefined" || !crypto.subtle) {
    // Fallback: simple hash for SSR or old browsers
    return str.split('').reduce((hash, char) => {
      return ((hash << 5) - hash) + char.charCodeAt(0) | 0;
    }, 0).toString(36);
  }
  
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function clearCachedModel(iterationId: string) {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }
  
  // Clear all blob URLs and cache entries for this iteration ID
  const keysToDelete: string[] = [];
  blobUrlCache.forEach((blobUrl, key) => {
    if (key.startsWith(`model_glb_${iterationId}_`)) {
      if (blobUrl.startsWith("blob:")) {
        URL.revokeObjectURL(blobUrl);
      }
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => blobUrlCache.delete(key));
  
  // Clear from cache storage (delete all entries starting with this iteration ID)
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  for (const request of requests) {
    if (request.url.includes(`model_glb_${iterationId}_`)) {
      await cache.delete(request);
    }
  }
}

export async function clearAllModelCache() {
  if (typeof window === "undefined" || !("caches" in window)) {
    return;
  }
  blobUrlCache.forEach((blobUrl) => {
    if (blobUrl.startsWith("blob:")) {
      URL.revokeObjectURL(blobUrl);
    }
  });
  blobUrlCache.clear();
  await caches.delete(CACHE_NAME);
}

