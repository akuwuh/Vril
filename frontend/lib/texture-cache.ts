/**
 * Two-tier texture caching for packaging panels
 * 
 * Tier 1: Cache Storage API (persistent across reloads)
 * Tier 2: In-memory Map (stable blob URLs to prevent React re-render loops)
 */

const CACHE_NAME = "packaging-textures";
const blobUrlCache = new Map<string, string>(); // panelId -> stable blob URL
const urlTracker = new Map<string, string>(); // panelId -> remoteUrl (to detect changes)

/**
 * Get cached texture URL for a panel.
 * Returns stable blob URL across calls (prevents React re-render loops).
 * 
 * @param panelId - Panel identifier (e.g., "front", "back", "body")
 * @param remoteUrl - Remote URL or base64 data URL from backend
 * @returns Stable blob URL that can be used in img src
 */
export async function getCachedTextureUrl(
  panelId: string,
  remoteUrl: string
): Promise<string> {
  // Check if URL changed - if so, invalidate cache
  const cachedUrl = urlTracker.get(panelId);
  if (cachedUrl && cachedUrl !== remoteUrl) {
    // New texture for same panel - clear old cache
    await clearTextureCache(panelId);
  }
  
  // Tier 2: Check in-memory cache first (stable blob URL)
  if (blobUrlCache.has(panelId) && urlTracker.get(panelId) === remoteUrl) {
    return blobUrlCache.get(panelId)!;
  }
  
  // Tier 1: Check Cache Storage (only if available in browser)
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = `texture_${panelId}`;
      const cached = await cache.match(cacheKey);
      
      if (cached) {
        const blob = await cached.blob();
        const blobUrl = URL.createObjectURL(blob);
        blobUrlCache.set(panelId, blobUrl);
        urlTracker.set(panelId, remoteUrl);
        return blobUrl;
      }
    } catch (error) {
      // Cache Storage might not be available, fall through to fetch
      console.warn('Cache Storage not available, using in-memory cache only:', error);
    }
  }
  
  // Cache miss: Fetch and cache
  const response = await fetch(remoteUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch texture for ${panelId}: ${response.statusText}`);
  }
  
  const blob = await response.blob();
  
  // Store in Cache Storage for persistence (only if available)
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = `texture_${panelId}`;
      await cache.put(cacheKey, new Response(blob));
    } catch (error) {
      // Cache Storage might not be available, continue with in-memory cache only
      console.warn('Failed to store in Cache Storage, using in-memory cache only:', error);
    }
  }
  
  // Create and store blob URL for in-memory cache
  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(panelId, blobUrl);
  urlTracker.set(panelId, remoteUrl); // Track URL for change detection
  
  return blobUrl;
}

/**
 * Clear cached texture for a specific panel or all panels.
 * 
 * @param panelId - Optional panel ID. If not provided, clears all textures.
 */
export async function clearTextureCache(panelId?: string): Promise<void> {
  if (panelId) {
    // Revoke blob URL to free memory
    const blobUrl = blobUrlCache.get(panelId);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    
    blobUrlCache.delete(panelId);
    urlTracker.delete(panelId);
    
    // Clear from Cache Storage if available
    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(`texture_${panelId}`);
      } catch (error) {
        // Cache Storage might not be available, continue
        console.warn('Failed to clear from Cache Storage:', error);
      }
    }
  } else {
    // Revoke all blob URLs
    for (const blobUrl of blobUrlCache.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    
    blobUrlCache.clear();
    urlTracker.clear();
    
    // Clear all from Cache Storage if available
    if (typeof caches !== 'undefined') {
      try {
        await caches.delete(CACHE_NAME);
      } catch (error) {
        // Cache Storage might not be available, continue
        console.warn('Failed to clear Cache Storage:', error);
      }
    }
  }
}

/**
 * Preload a texture into cache without returning the blob URL.
 * Useful for background prefetching.
 * 
 * @param panelId - Panel identifier
 * @param remoteUrl - Remote URL or base64 data URL
 */
export async function preloadTexture(
  panelId: string,
  remoteUrl: string
): Promise<void> {
  await getCachedTextureUrl(panelId, remoteUrl);
}

