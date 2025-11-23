import { PackagingState, PackagingStatus, PackageType, PackageDimensions } from "@/lib/packaging-types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const errorData = await response.json();
      detail = errorData.detail || JSON.stringify(errorData);
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getPackagingState(): Promise<PackagingState> {
  const response = await fetch(`${API_BASE}/packaging/state`);
  return handleResponse<PackagingState>(response);
}

export async function updatePackagingDimensions(
  packageType: PackageType,
  dimensions: PackageDimensions
): Promise<void> {
  const response = await fetch(`${API_BASE}/packaging/update-dimensions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ package_type: packageType, dimensions }),
  });
  await handleResponse(response);
}

export async function getPackagingStatus(): Promise<PackagingStatus> {
  const response = await fetch(`${API_BASE}/packaging/status`);
  return handleResponse<PackagingStatus>(response);
}

export async function clearPackagingState(): Promise<void> {
  const response = await fetch(`${API_BASE}/packaging/clear`, {
    method: "POST",
  });
  await handleResponse(response);
}

