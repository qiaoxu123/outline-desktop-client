import { describe, it, expect } from "vitest";
import {
  mergeById,
  purgeExpired,
  resolveRemoteSnapshot,
  type StoreItem,
} from "../webdavMerge";

interface Note extends StoreItem {
  content: string;
}
const note = (
  id: string,
  updatedAt: string,
  content = id,
  deletedAt: string | null = null,
): Note => ({ id, updatedAt, content, deletedAt });

const NOW = new Date("2026-07-31T00:00:00.000Z").getTime();

describe("mergeById", () => {
  it("同 id 保留 updatedAt 更新的一方", () => {
    const merged = mergeById(
      [note("a", "2026-07-31T10:00:00Z", "本地新")],
      [note("a", "2026-07-30T10:00:00Z", "远端旧")],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].content).toBe("本地新");
  });

  it("双方独有的条目都保留（多设备并发）", () => {
    const merged = mergeById(
      [note("a", "2026-07-31T10:00:00Z")],
      [note("b", "2026-07-31T09:00:00Z")],
    );
    expect(merged.map((n) => n.id).sort()).toEqual(["a", "b"]);
  });
});

describe("purgeExpired", () => {
  it("软删除超过 30 天才清理", () => {
    const fresh = note("a", "2026-07-01T00:00:00Z", "a", "2026-07-30T00:00:00Z");
    const old = note("b", "2026-01-01T00:00:00Z", "b", "2026-05-01T00:00:00Z");
    const kept = purgeExpired([fresh, old], NOW);
    expect(kept.map((n) => n.id)).toEqual(["a"]);
  });
});

// 冷启动拉取耗时数秒（经坚果云），期间「随手记」很容易插进来 —— 这是数据丢失级竞态
describe("resolveRemoteSnapshot", () => {
  it("拉取期间无本地变更时以远端为准（否则别的设备的硬删除会复活）", () => {
    const local = [note("a", "2026-07-30T00:00:00Z")]; // 缓存里还留着
    const remote: Note[] = []; // 别的设备已硬删除
    expect(resolveRemoteSnapshot(local, remote, false, NOW)).toEqual([]);
  });

  it("拉取期间记了新条目：不能被远端旧快照覆盖掉", () => {
    const remote = [note("old", "2026-07-30T00:00:00Z")];
    const local = [
      note("old", "2026-07-30T00:00:00Z"),
      note("new", "2026-07-31T00:00:00Z", "刚记的"),
    ];
    const next = resolveRemoteSnapshot(local, remote, true, NOW);
    expect(next.map((n) => n.id).sort()).toEqual(["new", "old"]);
    expect(next.find((n) => n.id === "new")?.content).toBe("刚记的");
  });

  it("拉取期间编辑了条目：本地较新的版本胜出", () => {
    const remote = [note("a", "2026-07-30T00:00:00Z", "远端旧文")];
    const local = [note("a", "2026-07-31T00:00:00Z", "刚改的")];
    const next = resolveRemoteSnapshot(local, remote, true, NOW);
    expect(next[0].content).toBe("刚改的");
  });

  it("合并结果同样受过期清理约束", () => {
    const remote: Note[] = [];
    const local = [
      note("stale", "2026-01-01T00:00:00Z", "x", "2026-01-02T00:00:00Z"),
    ];
    expect(resolveRemoteSnapshot(local, remote, true, NOW)).toEqual([]);
  });
});
