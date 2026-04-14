export async function isWebGpuUsable(): Promise<boolean> {
  try {
    const gpu = navigator.gpu;
    if (!gpu) return false;
    const adapter = await gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}
