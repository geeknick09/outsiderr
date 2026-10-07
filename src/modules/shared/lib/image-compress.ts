/**
 * Compress an image to fit under maxBytes (default 1MB) using Canvas.
 * Preserves aspect ratio, outputs as JPEG with adjustable quality.
 */
export async function compressImage(
  file: File,
  maxBytes: number = 1_000_000,
  initialQuality: number = 0.92,
): Promise<File> {
  if (file.size <= maxBytes) return file;

  const img = new Image();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  return new Promise((resolve, reject) => {
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      const maxDimension = 2048;

      // Downscale if too large (performance)
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      const quality = initialQuality;

      const attempt = (q: number) => {
        canvas.toBlob(
          (b) => {
            if (!b) {
              reject(new Error("Compression failed"));
              return;
            }
            if (b.size <= maxBytes || q <= 0.1) {
              // Accept if under limit or quality floor hit
              const compressed = new File([b], file.name, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressed);
            } else {
              // Lower quality and retry
              attempt(q - 0.1);
            }
          },
          "image/jpeg",
          q,
        );
      };

      attempt(quality);
    };

    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}
