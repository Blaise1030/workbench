export function encodeBranch(branch: string): string {
  return encodeURIComponent(branch);
}

export function decodeBranch(param: string): string {
  return decodeURIComponent(param);
}
