import { describe, expect, it } from "vitest";
import { ACTIVITY_ENTRIES } from "../activityBarOrder";

describe("hybrid navigation entries", () => {
  it("keeps the official Web and three local extension entries", () => {
    const entries = new Map(ACTIVITY_ENTRIES.map((entry) => [entry.key, entry]));

    expect(entries.get("home")).toMatchObject({
      label: "官方文档",
      route: "/official",
    });
    expect(entries.get("notes")).toMatchObject({ route: "/notes" });
    expect(entries.get("papers")).toMatchObject({ route: "/papers" });
    expect(entries.get("discuss")).toMatchObject({ route: "/discuss" });
  });
});
