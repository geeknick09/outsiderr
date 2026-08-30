import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0A0E",
          fontSize: 110,
          fontWeight: 900,
          color: "#8B5CF6",
          letterSpacing: -4,
        }}
      >
        O
      </div>
    ),
    { ...size },
  );
}
