import { describe, it, expect } from "vitest";
import {
  proseToMarkdown,
  proseToPlainText,
  isRichComment,
  splitQuoteLead,
} from "../commentDoc";

/** 贴近 Outline 实际下发的评论 doc 结构。 */
const doc = (...content: unknown[]): unknown => ({ type: "doc", content });
const p = (...content: unknown[]): unknown => ({ type: "paragraph", content });
const t = (text: string, ...marks: string[]): unknown => ({
  type: "text",
  text,
  ...(marks.length ? { marks: marks.map((m) => ({ type: m })) } : {}),
});

describe("proseToMarkdown", () => {
  it("段落之间留空行，不粘成一坨", () => {
    expect(proseToMarkdown(doc(p(t("第一段")), p(t("第二段"))))).toBe(
      "第一段\n\n第二段",
    );
  });

  it("保留加粗 / 斜体 / 行内代码 / 链接", () => {
    const d = doc(
      p(
        t("普通"),
        t("粗", "strong"),
        t("斜", "em"),
        t("码", "code_inline"),
        { type: "text", text: "链", marks: [{ type: "link", attrs: { href: "https://a.b" } }] },
      ),
    );
    expect(proseToMarkdown(d)).toBe("普通**粗***斜*`码`[链](https://a.b)");
  });

  it("无序列表带上 - 标记（旧实现会丢掉，读起来分不清条目）", () => {
    const d = doc({
      type: "bullet_list",
      content: [
        { type: "list_item", content: [p(t("继续直走"))] },
        { type: "list_item", content: [p(t("左转"))] },
      ],
    });
    expect(proseToMarkdown(d)).toBe("- 继续直走\n- 左转");
  });

  it("有序列表按序号编号", () => {
    const d = doc({
      type: "ordered_list",
      content: [
        { type: "list_item", content: [p(t("甲"))] },
        { type: "list_item", content: [p(t("乙"))] },
      ],
    });
    expect(proseToMarkdown(d)).toBe("1. 甲\n2. 乙");
  });

  it("待办列表渲染成 checkbox", () => {
    const d = doc({
      type: "checkbox_list",
      content: [
        { type: "checkbox_item", attrs: { checked: true }, content: [p(t("做完了"))] },
        { type: "checkbox_item", attrs: { checked: false }, content: [p(t("没做"))] },
      ],
    });
    expect(proseToMarkdown(d)).toBe("- [x] 做完了\n- [ ] 没做");
  });

  it("代码块保留围栏和语言，且与相邻段落分开", () => {
    const d = doc(
      p(t("看这段：")),
      { type: "code_block", attrs: { language: "ts" }, content: [t("const a = 1;")] },
      p(t("完")),
    );
    expect(proseToMarkdown(d)).toBe(
      "看这段：\n\n```ts\nconst a = 1;\n```\n\n完",
    );
  });

  it("引用块加 > 前缀", () => {
    const d = doc({ type: "blockquote", content: [p(t("原文"))] });
    expect(proseToMarkdown(d)).toBe("> 原文");
  });

  it("硬换行不再凭空消失", () => {
    const d = doc(p(t("上"), { type: "br" }, t("下")));
    expect(proseToMarkdown(d)).toBe("上  \n下");
  });

  it("图片/提及这类节点不再产出空串", () => {
    const d = doc(
      p({ type: "image", attrs: { src: "https://x/y.png", alt: "图" } }),
      p({ type: "mention", attrs: { label: "乔旭" } }),
    );
    expect(proseToMarkdown(d)).toBe("![图](https://x/y.png)\n\n乔旭");
  });

  it("未知块级节点递归取内容，宁可样式退化也不丢字", () => {
    const d = doc({
      type: "some_future_node",
      content: [p(t("藏在未知节点里的正文"))],
    });
    expect(proseToMarkdown(d)).toBe("藏在未知节点里的正文");
  });

  it("结构异常时返回空串而不是抛异常", () => {
    expect(proseToMarkdown(null)).toBe("");
    expect(proseToMarkdown("字符串")).toBe("");
  });
});

describe("proseToPlainText", () => {
  it("锚点引用行仍可被 「…」 正则提取", () => {
    const d = doc(p(t("「轨迹多模态信息」", "em")), p(t("正文")));
    const text = proseToPlainText(d);
    expect(/「([^」]+)」/.exec(text)?.[1]).toBe("轨迹多模态信息");
  });
});

describe("splitQuoteLead", () => {
  it("线上那条评论：引用行与正文拆开（真实数据形状）", () => {
    const d = doc(
      p(t("「轨迹多模态信息」", "em")),
      p(t("Remember Intentions: Retrospective-Memory-based Trajectory Prediction")),
    );
    const { quote, body } = splitQuoteLead(proseToMarkdown(d));
    expect(quote).toBe("轨迹多模态信息");
    expect(body).toBe(
      "Remember Intentions: Retrospective-Memory-based Trajectory Prediction",
    );
  });

  it("没有引用行时正文原样返回", () => {
    const r = splitQuoteLead("就是一条普通评论");
    expect(r.quote).toBeNull();
    expect(r.body).toBe("就是一条普通评论");
  });

  it("正文中间的 「…」 不当成锚点提走", () => {
    const r = splitQuoteLead("我觉得「这个说法」有问题");
    expect(r.quote).toBeNull();
  });

  it("只有引用行、没有正文时 body 为空", () => {
    const r = splitQuoteLead("*「只引用」*");
    expect(r.quote).toBe("只引用");
    expect(r.body).toBe("");
  });
});

describe("isRichComment", () => {
  it("纯段落 + 「…」斜体引用可安全编辑", () => {
    expect(isRichComment(doc(p(t("「引用」", "em")), p(t("普通评论"))))).toBe(
      false,
    );
  });

  it("含列表 / 加粗 / 代码块的评论判定为富文本（编辑会碾平，需拦住）", () => {
    expect(isRichComment(doc(p(t("粗", "strong"))))).toBe(true);
    expect(
      isRichComment(
        doc({ type: "bullet_list", content: [{ type: "list_item", content: [p(t("a"))] }] }),
      ),
    ).toBe(true);
    expect(
      isRichComment(doc({ type: "code_block", content: [t("x")] })),
    ).toBe(true);
  });
});
