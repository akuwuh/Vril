// API configuration
// In production, this should come from environment variables

// Try 127.0.0.1 first as it's more reliable on Windows, fallback to localhost
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"

export const API_ENDPOINTS = {
  packaging: {
    generate: `${API_BASE_URL}/packaging/panels/generate`,
    getTexture: (panelId: string) => `${API_BASE_URL}/packaging/panels/${panelId}/texture`,
    deleteTexture: (panelId: string) => `${API_BASE_URL}/packaging/panels/${panelId}/texture`,
    getState: `${API_BASE_URL}/packaging/state`,
  },
  product: {
    create: `${API_BASE_URL}/product/create`,
    edit: `${API_BASE_URL}/product/edit`,
    getState: `${API_BASE_URL}/product`,
    getStatus: `${API_BASE_URL}/product/status`,
  },
}

