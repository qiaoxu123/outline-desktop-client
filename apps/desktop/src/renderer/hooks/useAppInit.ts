import { useEffect } from "react";
import { useProfileStore, useUIStore } from "../state/uiStore";
import { useElectronAPI } from "./useElectronAPI";

export function useAppInit(): void {
  const api = useElectronAPI();
  const setProfiles = useProfileStore((s) => s.setProfiles);
  const profiles = useProfileStore((s) => s.profiles);
  const activeProfileId = useUIStore((s) => s.activeProfileId);
  const setActiveProfileId = useUIStore((s) => s.setActiveProfileId);

  useEffect(() => {
    api.profiles.list().then((result) => {
      const r = result as {
        ok: boolean;
        data?: { id: string; name: string; serverUrl: string; createdAt: string }[];
      };
      if (r.ok && r.data) {
        setProfiles(r.data);
        if (r.data.length > 0 && !activeProfileId) {
          setActiveProfileId(r.data[0].id);
        }
      }
    });
  }, []);
}
