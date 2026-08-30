import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)",
          fontSize: 220,
          fontWeight: 900,
          color: "white",
          letterSpacing: -8,
        }}
      >
        O
      </div>
    ),
    { ...size },
  );
}
