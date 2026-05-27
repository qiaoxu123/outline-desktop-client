import { readProfiles, writeProfiles, type StoredProfile } from "../storage/profiles";

const DEFAULT_PROFILE: StoredProfile = {
  id: "default",
  name: "JLUMCNS-MEC",
  serverUrl: "https://notes.jlu-mcns.site",
  apiKey: "ol_api_8o8qqsak4V1Jijw8qJMI18FYOC2uafdDexbxgT",
  createdAt: new Date().toISOString(),
};

export function ensureDefaultProfile(): void {
  const profiles = readProfiles();
  const exists = profiles.some((p) => p.serverUrl === DEFAULT_PROFILE.serverUrl);
  if (!exists) {
    profiles.push(DEFAULT_PROFILE);
    writeProfiles(profiles);
  }
}
