"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { Button } from "@/components/ui/button";

/**
 * Crop + reposition modal.
 * Opens after a user selects a file, lets them drag/zoom to adjust,
 * then outputs the cropped image as a File via onCropComplete.
 */
export function ImageCropper({
  file,
  aspect = 1,
  onCropComplete,
  onCancel,
  title = "Adjust image",
  maxFileSizeBytes,
  onSizeError,
}: {
  file: File;
  aspect?: number;
  onCropComplete: (croppedFile: File) => void;
  onCancel: () => void;
  title?: string;
  maxFileSizeBytes?: number;
  onSizeError?: (message: string) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onCropChange = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleApply() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    setError(null);
    try {
      const cropped = await cropImage(file, croppedAreaPixels);
      if (maxFileSizeBytes && cropped.size > maxFileSizeBytes) {
        const msg = `Cropped image is too large (${(cropped.size / 1024 / 1024).toFixed(1)} MB). Please choose a smaller image or crop a smaller area.`;
        if (onSizeError) onSizeError(msg);
        else setError(msg);
        return;
      }
      onCropComplete(cropped);
    } finally {
      setProcessing(false);
    }
  }

  function handleCancel() {
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 dark:bg-zinc-900">
        <h3 className="text-sm font-bold">{title}</h3>

        {error ? (
          <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-500">{error}</p>
        ) : null}

        <div className="relative h-64 w-full overflow-hidden rounded-2xl bg-zinc-900">
          {imageUrl ? (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropChange}
              style={{
                containerStyle: { borderRadius: "1rem" },
                cropAreaStyle: { border: "2px solid rgba(139,92,246,0.6)" },
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Loading image…
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-violet-neon"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={handleCancel} disabled={processing}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply} loading={processing} loadingText="Processing…">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Crop the image to the specified pixel area and return a new File.
 */
async function cropImage(file: File, pixels: Area): Promise<File> {
  const image = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  canvas.width = pixels.width;
  canvas.height = pixels.height;

  ctx.drawImage(
    image,
    pixels.x,
    pixels.y,
    pixels.width,
    pixels.height,
    0,
    0,
    pixels.width,
    pixels.height,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to crop image"))),
      "image/jpeg",
      0.9,
    );
  });

  const name = file.name.replace(/\.[^.]+$/, "") + "-cropped.jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Wrapper that manages file selection → crop modal → upload flow.
 * Renders a file input button. When a file is selected, opens the cropper.
 * After cropping, calls onCropped with the cropped File.
 */
export function ImageUploadWithCrop({
  onCropped,
  aspect = 1,
  label = "Upload image",
  className = "",
  accept = "image/*",
  maxFileSizeBytes,
  onSizeError,
}: {
  onCropped: (file: File) => void;
  aspect?: number;
  label?: React.ReactNode;
  className?: string;
  accept?: string;
  maxFileSizeBytes?: number;
  onSizeError?: (message: string) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (maxFileSizeBytes && file.size > maxFileSizeBytes) {
        const msg = `Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please choose a file under ${(maxFileSizeBytes / 1024 / 1024).toFixed(0)} MB.`;
        if (onSizeError) onSizeError(msg);
      } else {
        setSelectedFile(file);
      }
    }
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  return (
    <>
      <label className={className}>
        {label}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
      {selectedFile ? (
        <ImageCropper
          file={selectedFile}
          aspect={aspect}
          maxFileSizeBytes={maxFileSizeBytes}
          onSizeError={onSizeError}
          onCropComplete={(cropped) => {
            onCropped(cropped);
            setSelectedFile(null);
          }}
          onCancel={() => setSelectedFile(null)}
        />
      ) : null}
    </>
  );
}
