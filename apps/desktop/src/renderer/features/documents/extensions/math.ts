import { Node, nodeInputRule, type NodeViewRenderer } from "@tiptap/core";
import katex from "katex";
import type MarkdownIt from "markdown-it";
import katexPlugin from "@vscode/markdown-it-katex";

/**
 * Dedicated math nodes, mirroring Outline web's math_inline / math_block.
 *
 * The previous @tiptap/extension-mathematics approach kept formulas as plain
 * text and decorated them with a regex — so the markdown round-trip escaped
 * `_` and `\` and mangled complex LaTeX. Storing the source in a `latex`
 * attribute on an atom node and serializing it with `state.text(latex, false)`
 * (no escaping — exactly what Outline web does) makes the round-trip lossless.
 */

type MdPlugin = (md: MarkdownIt, opts?: unknown) => void;
const resolvedKatexPlugin =
  (katexPlugin as unknown as { default?: MdPlugin }).default ??
  (katexPlugin as unknown as MdPlugin);

const SETUP_FLAG = "__outlineMathSetup";

/**
 * Registered through tiptap-markdown's `parse.setup`, which is invoked on
 * EVERY parse against the same markdown-it instance — the flag guard keeps
 * the inline/block rules from being registered twice.
 *
 * The katex plugin tokenizes `$...$` / `$$...$$` before emphasis runs, so the
 * raw LaTeX (underscores, backslashes) reaches us untouched; we then override
 * its renderer rules to emit source-carrying elements that our parseHTML
 * picks up, instead of pre-rendered KaTeX HTML.
 */
function setupMarkdownItMath(md: MarkdownIt): void {
  const flagged = md as MarkdownIt & { [SETUP_FLAG]?: boolean };
  if (flagged[SETUP_FLAG]) return;
  flagged[SETUP_FLAG] = true;

  md.use(resolvedKatexPlugin, { throwOnError: false, strict: false });

  const inlineSrc = (tokens: { content: string }[], idx: number) =>
    `<span data-math="inline">${md.utils.escapeHtml(tokens[idx].content.trim())}</span>`;
  const blockSrc = (tokens: { content: string }[], idx: number) =>
    `<div data-math="block">${md.utils.escapeHtml(tokens[idx].content.trim())}</div>`;

  const rules = md.renderer.rules as Record<
    string,
    (tokens: { content: string }[], idx: number) => string
  >;
  rules.math_inline = inlineSrc;
  // `$$…$$` inside a paragraph — tiptap-markdown's normalizeBlocks hoists the
  // div out of the enclosing <p>, so it still becomes a proper block node.
  rules.math_inline_block = blockSrc;
  rules.math_inline_bare_block = blockSrc;
  rules.math_block = blockSrc;
}

/* ---------- node view (shared between inline and block) ---------- */

function renderPreview(
  target: HTMLElement,
  latex: string,
  displayMode: boolean,
): void {
  if (!latex.trim()) {
    target.classList.remove("math-error");
    target.innerHTML = "";
    const hint = document.createElement("span");
    hint.className = "math-placeholder";
    hint.textContent = "空公式 — 点击输入 LaTeX";
    target.appendChild(hint);
    return;
  }
  try {
    katex.render(latex, target, {
      throwOnError: false,
      strict: false,
      displayMode,
    });
    target.classList.remove("math-error");
  } catch {
    // throwOnError:false still throws on some parse errors — show raw source.
    target.textContent = latex;
    target.classList.add("math-error");
  }
}

function createMathView(displayMode: boolean): NodeViewRenderer {
  return ({ node, editor, getPos }) => {
    let currentNode = node;
    let latex: string = node.attrs.latex as string;
    let editing = false;

    const dom = document.createElement(displayMode ? "div" : "span");
    dom.className = displayMode ? "math-node math-node-block" : "math-node";

    const preview = document.createElement(displayMode ? "div" : "span");
    preview.className = "math-render";
    dom.appendChild(preview);
    renderPreview(preview, latex, displayMode);

    const src = document.createElement(displayMode ? "textarea" : "input") as
      | HTMLInputElement
      | HTMLTextAreaElement;
    src.className = displayMode ? "math-src math-src-block" : "math-src";
    src.spellcheck = false;
    if (!displayMode) (src as HTMLInputElement).type = "text";
    src.placeholder = displayMode ? "LaTeX 公式（Cmd/Ctrl+Enter 完成）" : "LaTeX";

    const sizeInput = () => {
      if (displayMode) {
        src.style.height = "auto";
        src.style.height = `${Math.max(src.scrollHeight, 36)}px`;
      } else {
        src.style.width = `${Math.max(4, src.value.length + 2)}ch`;
      }
    };

    const open = () => {
      if (editing || !editor.isEditable) return;
      editing = true;
      src.value = latex;
      dom.appendChild(src);
      dom.classList.add("editing");
      sizeInput();
      window.setTimeout(() => {
        src.focus();
        src.setSelectionRange(src.value.length, src.value.length);
      }, 0);
    };

    const close = () => {
      if (!editing) return;
      editing = false;
      src.remove();
      dom.classList.remove("editing");
      renderPreview(preview, latex, displayMode);
    };

    const commit = () => {
      const value = src.value;
      close();
      const pos = typeof getPos === "function" ? getPos() : undefined;
      if (typeof pos !== "number") return;
      if (!value.trim()) {
        // Committing an empty formula removes the node entirely.
        editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + currentNode.nodeSize })
          .run();
        return;
      }
      if (value === latex) {
        editor.commands.focus();
        return;
      }
      latex = value;
      renderPreview(preview, latex, displayMode);
      // `.focus()` in the chain matters: the autosave handler ignores updates
      // while the editor isn't focused, and focus lives in our input here.
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { latex: value });
          return true;
        })
        .run();
    };

    // The input|textarea union makes addEventListener resolve to the generic
    // (Event) overload — cast to keep the KeyboardEvent typing.
    src.addEventListener("keydown", ((e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Enter" && (!displayMode || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
        editor.commands.focus();
      }
    }) as EventListener);
    src.addEventListener("input", () => {
      sizeInput();
      renderPreview(preview, src.value, displayMode);
    });
    src.addEventListener("blur", () => {
      if (editing) commit();
    });
    dom.addEventListener("click", () => {
      if (!editing) open();
    });

    // A formula created empty (bubble button / `$$␣` input rule) opens its
    // source editor immediately so the user can start typing.
    if (!latex.trim()) window.setTimeout(open, 0);

    return {
      dom,
      selectNode() {
        dom.classList.add("ProseMirror-selectednode");
      },
      deselectNode() {
        dom.classList.remove("ProseMirror-selectednode");
      },
      update(updated) {
        if (updated.type !== currentNode.type) return false;
        currentNode = updated;
        const next = updated.attrs.latex as string;
        if (next !== latex) {
          latex = next;
          if (!editing) renderPreview(preview, latex, displayMode);
        }
        return true;
      },
      stopEvent(event) {
        return src.contains(event.target as globalThis.Node);
      },
      ignoreMutation() {
        return true;
      },
      destroy() {
        src.remove();
      },
    };
  };
}

/* ---------- markdown storage specs (tiptap-markdown) ---------- */

interface SerializerState {
  write(content: string): void;
  text(content: string, escape?: boolean): void;
  ensureNewLine(): void;
  closeBlock(node: unknown): void;
}

/* ---------- nodes ---------- */

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return { latex: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math="inline"]',
        getAttrs: (el) => ({ latex: (el as HTMLElement).textContent ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    // Source-carrying markup so copy/paste round-trips through parseHTML.
    return ["span", { "data-math": "inline" }, node.attrs.latex as string];
  },

  addNodeView() {
    return createMathView(false);
  },

  addInputRules() {
    return [
      nodeInputRule({
        find: /(?<![\\$\w])\$(?!\s)((?:\\\$|[^$\n])+?)(?<![\s\\])\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1] }),
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { latex: string } }) {
          state.write("$");
          state.text(node.attrs.latex, false); // false → no escaping (web parity)
          state.write("$");
        },
        // Covers MathBlock too — both nodes are always registered together.
        parse: { setup: setupMarkdownItMath },
      },
    };
  },
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return { latex: { default: "" } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math="block"]',
        getAttrs: (el) => ({ latex: (el as HTMLElement).textContent ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    return ["div", { "data-math": "block" }, node.attrs.latex as string];
  },

  addNodeView() {
    return createMathView(true);
  },

  addInputRules() {
    // Typing `$$ ` at the start of a line inserts an empty formula block
    // (whose node view opens its source editor immediately).
    return [
      nodeInputRule({
        find: /^\$\$\s$/,
        type: this.type,
      }),
    ];
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: { latex: string } }) {
          state.write("$$\n");
          state.text(node.attrs.latex, false);
          state.ensureNewLine();
          state.write("$$");
          state.closeBlock(node);
        },
      },
    };
  },
});
