import { useState, useRef, type ChangeEvent, type DragEvent } from "react";

interface PhotoUploaderProps {
  images: any[];
  onChange: (images: any[]) => void;
  maxPhotos?: number;
}

export function PhotoUploader({ images, onChange, maxPhotos = 20 }: PhotoUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFiles = (files: FileList | null) => {
    if (!files) return;
    const remaining = maxPhotos - images.length;
    if (remaining <= 0) return;

    const validFiles = Array.from(files).filter(f =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type)
    ).slice(0, remaining);

    if (validFiles.length === 0) return;

    let loaded = 0;
    const newImages: any[] = [];

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl) newImages.push(dataUrl);
        loaded++;
        if (loaded === validFiles.length) {
          onChange([...images, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const updated = [...images];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    onChange(updated);
  };

  return (
    <div>
      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-[#0f3c52] bg-[#0f3c52]/5"
            : "border-gray-300 hover:border-gray-400 bg-gray-50"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <div className="text-3xl mb-2">📸</div>
        <p className="text-sm font-medium text-gray-600">
          {dragOver ? "Drop photos here" : "Click or drag photos here"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          JPEG, PNG, WebP · Max {maxPhotos} photos · {images.length}/{maxPhotos} used
        </p>
      </div>

      {/* Thumbnail grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4">
          {images.map((img, i) => (
            <div key={i} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square">
              <img
                src={img}
                alt={`Photo ${i + 1}`}
                className="w-full h-full object-cover"
              />
              {/* Overlay with controls */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); moveImage(i, i - 1); }}
                    className="bg-white/90 rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-white"
                    title="Move left"
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  className="bg-red-500/90 rounded-full w-7 h-7 flex items-center justify-center text-white text-xs hover:bg-red-600"
                  title="Remove"
                >
                  ✕
                </button>
                {i < images.length - 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); moveImage(i, i + 1); }}
                    className="bg-white/90 rounded-full w-7 h-7 flex items-center justify-center text-xs hover:bg-white"
                    title="Move right"
                  >
                    →
                  </button>
                )}
              </div>
              {i === 0 && (
                <span className="absolute top-1 left-1 bg-[#0f3c52] text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                  Cover
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
