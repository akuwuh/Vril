import { ProductState, ProductStatus } from "@/lib/product-types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function createProduct(prompt: string, imageCount: number = 1): Promise<ProductStatus> {
  const response = await fetch(`${API_BASE}/product/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, image_count: imageCount }),
  });

  return handleResponse(response);
}

export async function editProduct(prompt: string): Promise<ProductStatus> {
  const response = await fetch(`${API_BASE}/product/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  return handleResponse(response);
}

export async function getProductState(): Promise<ProductState> {
  const response = await fetch(`${API_BASE}/product`);
  return handleResponse<ProductState>(response);
}

export async function getProductStatus(): Promise<ProductStatus> {
  const response = await fetch(`${API_BASE}/product/status`);
  return handleResponse<ProductStatus>(response);
}

export async function rewindProduct(
  iterationIndex: number,
): Promise<{ status: string; iteration_index: number; total_iterations: number }> {
  const response = await fetch(`${API_BASE}/product/rewind/${iterationIndex}`, {
    method: "POST",
  });
  return handleResponse(response);
}

export async function recoverProductState(): Promise<{ recovered: boolean; message?: string }> {
  const response = await fetch(`${API_BASE}/product/recover`, {
    method: "POST",
  });
  return handleResponse(response);
}

