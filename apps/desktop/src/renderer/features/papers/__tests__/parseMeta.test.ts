import { beforeAll, describe, expect, it } from "vitest";
import type { PaperMeta } from "../usePapers";

// usePapers.ts 间接加载 uiStore，后者在模块顶层读写 localStorage——
// node 测试环境没有，加载前先注入一个最小 stub，再动态 import。
const store = new Map<string, string>();
const lsStub: Storage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).localStorage = lsStub;

let parsePaperMeta: (text: string) => PaperMeta;
beforeAll(async () => {
  ({ parsePaperMeta } = await import("../usePapers"));
});

describe("parsePaperMeta — 开源代码仓库解析", () => {
  it("从 markdown 链接提取 代码仓库 的 URL", () => {
    const text = [
      "| 属性 | 详情 |",
      "|------|------|",
      "| 论文链接 | [alphaxiv](https://www.alphaxiv.org/abs/2608.05597) |",
      "| 代码仓库 | [github.com/DurYi/UA-NWM](https://github.com/DurYi/UA-NWM) |",
      "| 领域 | 世界模型、UAV |",
    ].join("\n");
    const meta = parsePaperMeta(text);
    expect(meta.code).toBe("https://github.com/DurYi/UA-NWM");
    expect(meta.link).toBe("https://www.alphaxiv.org/abs/2608.05597");
  });

  it("代码仓库 行直接写裸 URL 也能解析", () => {
    const text = "| 代码仓库 | https://github.com/x/y |\n";
    expect(parsePaperMeta(text).code).toBe("https://github.com/x/y");
  });

  it("没有 代码仓库 行时 code 为 null", () => {
    const text = "| 属性 | 详情 |\n|------|------|\n| 领域 | 测试 |\n";
    expect(parsePaperMeta(text).code).toBeNull();
  });
});
