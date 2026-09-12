/** Local persistence that is isolated per Outline profile. */
export function profileStorageKey(profileId: string | null | undefined, key: string): string {
  return `profile:${profileId ?? "anonymous"}:${key}`;
}

export function readProfileStorage(
  profileId: string | null | undefined,
  key: string,
): string | null {
  return localStorage.getItem(profileStorageKey(profileId, key));
}

export function writeProfileStorage(
  profileId: string | null | undefined,
  key: string,
  value: string,
): void {
  localStorage.setItem(profileStorageKey(profileId, key), value);
}
