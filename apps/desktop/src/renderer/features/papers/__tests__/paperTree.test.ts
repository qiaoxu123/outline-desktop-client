import { describe, it, expect } from "vitest";
import {
  collectPapers,
  collectFeatured,
  collectInternalWork,
  type PaperEntry,
} from "../paperTree";
import type { OutlineCollectionDocument } from "@outline/shared-types";

/** 造一个树节点（只用到 id/title/children/emoji）。 */
const n = (
  title: string,
  children: OutlineCollectionDocument[] = [],
): OutlineCollectionDocument =>
  ({ id: title, title, children }) as unknown as OutlineCollectionDocument;

describe("collectPapers（推荐阅读：年/月 文件夹是容器）", () => {
  it("从 年 → 月 → 论文 的层级里带出年月", () => {
    const out: PaperEntry[] = [];
    collectPapers([n("2026 年论文推荐阅读", [n("7 月", [n("某论文")])])], null, null, out);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "某论文", year: 2026, month: 7 });
  });

  it("论文自身的子文档是附录，不算论文", () => {
    const out: PaperEntry[] = [];
    collectPapers([n("2026 年", [n("1 月", [n("主论文", [n("附录 A")])])])], null, null, out);
    expect(out.map((p) => p.title)).toEqual(["主论文"]);
  });
});

// 本次新增：扩展学习/同行成果 → 团队文件夹 → 📖 论文
describe("collectFeatured（同行成果 / 精选：只认 📖）", () => {
  const peerTree = [
    n("南方科技大学周博宇团队", [
      n("📖 CARIC: 异构多UAV协同巡检规划基准"),
      n("📖 OnFly: 机载零样本空中视觉语言导航"),
    ]),
    n("浙大高飞团队", [n("📖 VLA-AN: 机载端到端视觉语言行动框架")]),
    n("西湖大学 WindyLab", []), // 空团队文件夹
  ];

  it("团队文件夹下的 📖 论文都被收进来，topic 落成团队名", () => {
    const out: PaperEntry[] = [];
    collectFeatured(peerTree, null, out, "peer");
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.topic)).toEqual([
      "南方科技大学周博宇团队",
      "南方科技大学周博宇团队",
      "浙大高飞团队",
    ]);
    expect(out.every((p) => p.source === "peer")).toBe(true);
  });

  it("空团队文件夹不产生条目", () => {
    const out: PaperEntry[] = [];
    collectFeatured([n("空团队", [])], null, out, "peer");
    expect(out).toEqual([]);
  });

  it("没有 📖 前缀的文档不算论文（团队主页/说明页）", () => {
    const out: PaperEntry[] = [];
    collectFeatured([n("某团队", [n("团队简介"), n("📖 真论文")])], null, out, "peer");
    expect(out.map((p) => p.title)).toEqual(["📖 真论文"]);
  });

  it("嵌在论文下面的 📖 仍是论文，且继承同一 topic", () => {
    const out: PaperEntry[] = [];
    collectFeatured(
      [n("某团队", [n("📖 外层", [n("📖 内层")])])],
      null,
      out,
      "peer",
    );
    expect(out.map((p) => p.title)).toEqual(["📖 外层", "📖 内层"]);
    expect(out.every((p) => p.topic === "某团队")).toBe(true);
  });

  it("默认来源是 featured（精选论文/精选专题沿用旧行为）", () => {
    const out: PaperEntry[] = [];
    collectFeatured([n("某专题", [n("📖 论文")])], null, out);
    expect(out[0]).toMatchObject({ source: "featured", topic: "某专题" });
  });
});

describe("collectInternalWork（组内工作）", () => {
  it("整棵树里的 📖 都算，topic 固定", () => {
    const out: PaperEntry[] = [];
    collectInternalWork([n("任意分组", [n("📖 解读一"), n("非论文")])], out);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ topic: "组内工作", source: "internal" });
  });
});
