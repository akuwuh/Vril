export interface TrellisArtifacts {
  model_file?: string;
  color_video?: string;
  gaussian_ply?: string;
  normal_video?: string;
  combined_video?: string;
  no_background_images: string[];
}

export interface ProductIteration {
  id: string;
  type: "create" | "edit";
  prompt: string;
  images: string[];
  trellis_output?: TrellisArtifacts;
  created_at: string;
  note?: string;
  duration_seconds?: number;
}

export interface ProductState {
  prompt?: string;
  latest_instruction?: string;
  mode: "idle" | "create" | "edit";
  status: string;
  message?: string;
  in_progress: boolean;
  generation_started_at?: string;
  image_count: number;
  images: string[];
  trellis_output?: TrellisArtifacts;
  iterations: ProductIteration[];
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductStatus {
  status: string;
  progress: number;
  message?: string;
  error?: string;
  model_file?: string;
  preview_image?: string;
  updated_at: string;
}

