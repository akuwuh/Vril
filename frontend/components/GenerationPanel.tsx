"use client";

import { useState, useRef } from "react";

interface GenerationPanelProps {
  onImagesSelected: (images: string[]) => void;
  selectedImages: string[];
  className?: string;
}

export default function GenerationPanel({
  onImagesSelected,
  selectedImages,
  className = ""
}: GenerationPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/')
    );

    if (imageFiles.length === 0) return;

    // Convert files to base64 data URLs
    const imagePromises = imageFiles.map(file => {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    try {
      const imageUrls = await Promise.all(imagePromises);
      onImagesSelected([...selectedImages, ...imageUrls]);
    } catch (error) {
      console.error('Error reading files:', error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    const newImages = selectedImages.filter((_, i) => i !== index);
    onImagesSelected(newImages);
  };

  return (
    <div className={`bg-[#2A3038] border-[0.5px] border-[#67B68B] rounded p-4 ${className}`}>
      <h3 className="text-[#67B68B] font-semibold mb-4">Generate 3D Model from Images</h3>

      {/* Image Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragOver
            ? "border-[#67B68B] bg-[#67B68B]/10"
            : "border-[#3a4560] hover:border-[#67B68B]/50"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mb-4">
          <svg
            className="w-12 h-12 text-[#67B68B] mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-[#67B68B] font-medium">
            Drop images here or click to browse
          </p>
          <p className="text-gray-400 text-sm mt-1">
            Supports PNG, JPG, JPEG files
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="bg-[#161924] border-[0.5px] border-[#3a4560] text-[#67B68B] px-4 py-2 rounded hover:bg-[#2A3142] transition-colors"
        >
          Choose Files
        </button>
      </div>

      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[#67B68B] text-sm font-medium mb-2">
            Selected Images ({selectedImages.length})
          </h4>
          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
            {selectedImages.map((imageUrl, index) => (
              <div key={index} className="relative group">
                <img
                  src={imageUrl}
                  alt={`Selected ${index + 1}`}
                  className="w-full h-20 object-cover rounded border border-[#3a4560]"
                />
                <button
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 p-3 bg-[#161924] border-[0.5px] border-[#3a4560] rounded">
        <h4 className="text-[#67B68B] text-sm font-medium mb-2">Tips:</h4>
        <ul className="text-gray-400 text-xs space-y-1">
          <li>• Use multiple images of the same object from different angles</li>
          <li>• Ensure good lighting and clear focus</li>
          <li>• Avoid blurry or low-resolution images</li>
          <li>• Generation may take several minutes</li>
        </ul>
      </div>
    </div>
  );
}
