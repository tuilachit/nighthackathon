import { ImageResponse } from "next/og";
import { PRODUCT_NAME, PRODUCT_PITCH } from "@/lib/site-config";

export const alt = "Fitment — furniture that fits your space and front door";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#f4f7f5",
          color: "#17221f",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px 80px 64px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-1.8px" }}>
            {PRODUCT_NAME.toUpperCase()}
          </div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "1px",
            }}
          >
            DIMENSIONALLY VERIFIED
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <div
            style={{
              display: "flex",
              fontSize: 58,
              fontWeight: 700,
              letterSpacing: "-2.8px",
              lineHeight: 1.08,
              maxWidth: 930,
            }}
          >
            {PRODUCT_PITCH}
          </div>

          <div
            style={{
              alignItems: "center",
              color: "#3f6b57",
              display: "flex",
              height: 76,
              position: "relative",
              width: "100%",
            }}
          >
            <div
              style={{
                borderLeft: "3px solid #3f6b57",
                borderRight: "3px solid #3f6b57",
                borderTop: "3px solid #3f6b57",
                display: "flex",
                height: 30,
                position: "absolute",
                top: 26,
                width: "100%",
              }}
            />
            <div
              style={{
                background: "#f4f7f5",
                display: "flex",
                fontFamily: "monospace",
                fontSize: 25,
                fontWeight: 700,
                margin: "0 auto",
                padding: "0 20px",
                position: "relative",
              }}
            >
              34 MM CLEARANCE
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
