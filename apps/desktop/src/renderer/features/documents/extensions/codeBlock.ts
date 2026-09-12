import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import CodeBlock from "@tiptap/extension-code-block";

const CODE_LANGUAGES = [
  ["", "Plain text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["jsx", "JSX"],
  ["tsx", "TSX"],
  ["python", "Python"],
  ["java", "Java"],
  ["csharp", "C#"],
  ["cpp", "C++"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["sql", "SQL"],
  ["bash", "Shell / Bash"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["html", "HTML"],
  ["css", "CSS"],
  ["markdown", "Markdown"],
  ["mermaid", "Mermaid"],
] as const;

const lineNumberKey = new PluginKey<DecorationSet>("codeBlockLineNumbers");

function buildLineNumberDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return;
    let offset = 0;
    const lines = node.textContent.split("\n");
    const lineNumberWidth = `${Math.max(1, String(lines.length).length)}ch`;
    lines.forEach((_, index) => {
      const number = document.createElement("span");
      number.className = "code-block-line-number";
      number.setAttribute("aria-hidden", "true");
      number.textContent = String(index + 1);
      number.style.width = lineNumberWidth;
      decorations.push(
        Decoration.widget(pos + 1 + offset, number, {
          side: -1,
          ignoreSelection: true,
        }),
      );
      offset += lines[index]?.length ?? 0;
      if (index < lines.length - 1) offset += 1;
    });
  });
  return DecorationSet.create(doc, decorations);
}

const CodeBlockLineNumbers = Extension.create({
  name: "codeBlockLineNumbers",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: lineNumberKey,
        state: {
          init: (_config, state) => buildLineNumberDecorations(state.doc),
          apply: (_transaction, _old, _oldState, newState) =>
            buildLineNumberDecorations(newState.doc),
        },
        props: {
          decorations: (state) => lineNumberKey.getState(state) ?? DecorationSet.empty,
        },
      }),
    ];
  },
});

/** Code block with an unobtrusive language control and inline line numbers. */
export const CodeBlockWithLanguage = CodeBlock.extend({
  addExtensions() {
    return [CodeBlockLineNumbers];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      let currentNode = node;
      // Keep the controls outside <pre>. Native selects inside a contenteditable
      // code block can be treated as editor selection, causing their popup to
      // close immediately. The wrapper remains the NodeView root while <pre>
      // contains only the editable code content.
      const dom = document.createElement("div");
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      const control = document.createElement("div");
      const languageButton = document.createElement("button");
      const languageMenu = document.createElement("div");
      const copyButton = document.createElement("button");

      dom.className = "code-block-node";
      pre.className = "code-block-pre";
      control.className = "code-block-language-control";
      control.setAttribute("aria-label", "代码语言");
      languageButton.className = "code-block-language-button";
      languageButton.type = "button";
      languageButton.setAttribute("aria-label", "代码语言");
      languageButton.setAttribute("aria-haspopup", "listbox");
      languageButton.setAttribute("aria-expanded", "false");
      languageMenu.className = "code-block-language-menu";
      languageMenu.setAttribute("role", "listbox");
      languageMenu.hidden = true;
      copyButton.className = "code-block-copy";
      copyButton.type = "button";
      copyButton.title = "复制代码";
      copyButton.setAttribute("aria-label", "复制代码");
      copyButton.innerHTML =
        '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-1A1.5 1.5 0 0 0 9 1H3a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 3 11h1"/></svg>';

      const languageLabel = () =>
        CODE_LANGUAGES.find(([value]) => value === currentNode.attrs.language)?.[1] ??
        "Plain text";
      const updateLanguage = (language: string) => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor.commands.command(({ tr }) => {
          const current = tr.doc.nodeAt(pos);
          if (!current) return false;
          tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            language: language || null,
          });
          return true;
        });
        languageMenu.hidden = true;
        languageButton.setAttribute("aria-expanded", "false");
      };
      languageButton.textContent = languageLabel();
      languageButton.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      languageButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        languageMenu.hidden = !languageMenu.hidden;
        languageButton.setAttribute("aria-expanded", String(!languageMenu.hidden));
      });
      for (const [value, label] of CODE_LANGUAGES) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "code-block-language-option";
        option.setAttribute("role", "option");
        option.textContent = label;
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        option.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          updateLanguage(value);
        });
        languageMenu.appendChild(option);
      }
      copyButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard.writeText(code.textContent ?? "").then(() => {
          copyButton.classList.add("copied");
          window.setTimeout(() => copyButton.classList.remove("copied"), 1200);
        });
      });

      control.append(languageButton, languageMenu);
      pre.appendChild(code);
      dom.append(pre, control, copyButton);

      return {
        dom,
        contentDOM: code,
        stopEvent: (event) =>
          event.target instanceof HTMLElement &&
          (control.contains(event.target) ||
            event.target === copyButton),
        update: (updatedNode) => {
          if (updatedNode.type !== currentNode.type) return false;
          currentNode = updatedNode;
          languageButton.textContent = languageLabel();
          return true;
        },
      };
    };
  },
});

export default CodeBlockWithLanguage;
