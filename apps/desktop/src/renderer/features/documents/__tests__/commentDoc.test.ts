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

// PM 的 text 是纯文本，转 markdown 时若不转义会被重新解释成格式（review 发现）
describe("markdown 转义", () => {
  it("字面量星号不会变成加粗", () => {
    expect(proseToMarkdown(doc(p(t("这里 **不该加粗** 才对"))))).toBe(
      "这里 \\*\\*不该加粗\\*\\* 才对",
    );
  });

  it("行首 - / # / > 不会变成列表、标题、引用", () => {
    expect(proseToMarkdown(doc(p(t("- 这不是列表"))))).toBe("\\- 这不是列表");
    expect(proseToMarkdown(doc(p(t("# 这不是标题"))))).toBe("\\# 这不是标题");
    expect(proseToMarkdown(doc(p(t("> 这不是引用"))))).toBe("\\> 这不是引用");
    expect(proseToMarkdown(doc(p(t("1. 这不是有序列表"))))).toBe(
      "1\\. 这不是有序列表",
    );
  });

  it("字面量反引号不会变成行内代码", () => {
    expect(proseToMarkdown(doc(p(t("用 `code` 表示"))))).toBe(
      "用 \\`code\\` 表示",
    );
  });

  it("带 code mark 的文本不转义，避免显示出反斜杠", () => {
    expect(proseToMarkdown(doc(p(t("a*b", "code_inline"))))).toBe("`a*b`");
  });

  it("不转义句点，保住裸链接的 linkify", () => {
    expect(proseToMarkdown(doc(p(t("见 https://example.com/a_b 页"))))).toContain(
      "example.com",
    );
    expect(proseToMarkdown(doc(p(t("见 example.com"))))).toBe("见 example.com");
  });

  it("含空格/括号的链接地址用尖括号包住，不撑破语法", () => {
    const d = doc(
      p({
        type: "text",
        text: "链",
        marks: [{ type: "link", attrs: { href: "https://x/a (b).pdf" } }],
      }),
    );
    expect(proseToMarkdown(d)).toBe("[链](<https://x/a (b).pdf>)");
  });
});

describe("代码块内容保真", () => {
  it("代码块里的空行不被折叠吃掉", () => {
    const d = doc({ type: "code_block", content: [t("a\n\n\nb")] });
    expect(proseToMarkdown(d)).toBe("```\na\n\n\nb\n```");
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

  it("引用块按纯文本显示，转义反斜杠要还原掉", () => {
    const d = doc(p(t("「含 *星号* 的原文」", "em")), p(t("正文")));
    const md = proseToMarkdown(d);
    // markdown 源码里星号是转义的
    expect(md).toContain("\\*");
    // 但引用块是纯文本渲染，显示时不能带反斜杠
    const { quote, body } = splitQuoteLead(md);
    expect(quote).toBe("含 *星号* 的原文");
    expect(body).toBe("正文");
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
