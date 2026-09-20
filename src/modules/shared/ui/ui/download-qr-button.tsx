"use client";

import { Download } from "lucide-react";
import QRCode from "qrcode";

export function DownloadQrButton({
  qrHash,
  filename,
}: {
  qrHash: string;
  filename: string;
}) {
  async function handleDownload() {
    const dataUrl = await QRCode.toDataURL(qrHash, {
      width: 512,
      margin: 2,
      color: { dark: "#0A0A0E", light: "#FFFFFF" },
    });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 py-2 text-xs font-semibold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
    >
      <Download className="h-3.5 w-3.5" />
      Download QR Pass
    </button>
  );
}
