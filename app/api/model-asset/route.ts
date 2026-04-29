import { NextResponse } from "next/server";
import { getRemoteModelAssetExtension, isSupportedRemoteModelAssetUrl } from "@/lib/assets";

const CONTENT_TYPES = {
  glb: "model/gltf-binary",
  usdz: "model/vnd.usdz+zip",
} as const;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");

  if (url === null || !isSupportedRemoteModelAssetUrl(url)) {
    return NextResponse.json({ error: "A valid HTTPS .glb or .usdz URL is required." }, { status: 400 });
  }

  const extension = getRemoteModelAssetExtension(url);

  if (extension === undefined) {
    return NextResponse.json({ error: "Unsupported model asset URL." }, { status: 400 });
  }

  try {
    const remoteResponse = await fetch(url, { cache: "no-store" });

    if (!remoteResponse.ok || remoteResponse.body === null) {
      return NextResponse.json({ error: "The remote model asset could not be fetched." }, { status: 502 });
    }

    return new Response(remoteResponse.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": CONTENT_TYPES[extension],
      },
      status: 200,
    });
  } catch {
    return NextResponse.json({ error: "The remote model asset could not be fetched." }, { status: 502 });
  }
}
