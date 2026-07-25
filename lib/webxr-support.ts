export async function isImmersiveArSupported(): Promise<boolean> {
  if (typeof navigator === "undefined" || navigator.xr === undefined) {
    return false;
  }

  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}
