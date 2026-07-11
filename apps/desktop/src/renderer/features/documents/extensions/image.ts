import Image from "@tiptap/extension-image";
import type { NodeViewRenderer } from "@tiptap/core";
import { absoluteAttachmentUrl } from "../../../lib/server";
import {
  parseImageTitle,
  composeImageTitle,
  type ImageLayoutClass,
} from "../../../lib/markdown/imageTitle";

/**
 * Image node aligned with Outline web: layout (left-50 / right-50 /
 * full-width) and size are encoded in the markdown title —
 * `![alt](src "full-width =875x385")` — so edits round-trip to web intact.
 *
 * The node view adds web-like adjustment UI when the image is selected:
 * layout buttons, live size label, side drag-handles to resize, download
 * and delete. Src is absolutized for display only (auth comes from the
 * main process's webRequest hook); attrs keep the relative path.
 */

const MIN_WIDTH = 80;

interface ImageAttrs {
  src: string;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  layoutClass: ImageLayoutClass | null;
}

function createImageView(): NodeViewRenderer {
  return ({ node, editor, getPos }) => {
    let currentNode = node;
    const attrs = () => currentNode.attrs as ImageAttrs;

    const dom = document.createElement("div");
    dom.className = "image-node";

    // inline-block frame hugs the (possibly narrower) image so the toolbar
    // and drag handles anchor to the image edges, not the full column
    const frame = document.createElement("div");
    frame.className = "image-frame";
    dom.appendChild(frame);

    const img = document.createElement("img");
    img.draggable = false;
    frame.appendChild(img);

    const toolbar = document.createElement("div");
    toolbar.className = "image-toolbar";
    frame.appendChild(toolbar);

    const sizeLabel = document.createElement("span");
    sizeLabel.className = "image-size-label";

    const handleLeft = document.createElement("div");
    handleLeft.className = "image-handle image-handle-left";
    const handleRight = document.createElement("div");
    handleRight.className = "image-handle image-handle-right";
    frame.appendChild(handleLeft);
    frame.appendChild(handleRight);

    const applyAttrs = () => {
      const a = attrs();
      img.src = absoluteAttachmentUrl(a.src);
      img.alt = a.alt ?? "";
      if (a.title) img.title = a.title;
      img.style.width = a.width ? `${a.width}px` : "";
      dom.className = `image-node${a.layoutClass ? ` image-${a.layoutClass}` : ""}`;
      sizeLabel.textContent =
        a.width && a.height ? `${a.width} × ${a.height}` : "原始大小";
    };

    const commit = (patch: Partial<ImageAttrs>) => {
      const pos = typeof getPos === "function" ? getPos() : undefined;
      if (typeof pos !== "number") return;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...attrs(), ...patch });
          return true;
        })
        .setNodeSelection(pos)
        .run();
    };

    /* toolbar: layout buttons | size | download | delete */
    const button = (
      title: string,
      svgPath: string,
      onClick: () => void,
      isActive?: () => boolean,
    ) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "image-tool-btn";
      btn.title = title;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="${svgPath}"/></svg>`;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      toolbar.appendChild(btn);
      return { btn, isActive };
    };

    const layoutButtons: { btn: HTMLButtonElement; isActive?: () => boolean }[] = [];
    const layoutBtn = (
      title: string,
      path: string,
      cls: ImageLayoutClass | null,
    ) =>
      layoutButtons.push(
        button(
          title,
          path,
          () => commit({ layoutClass: attrs().layoutClass === cls ? null : cls }),
          () => attrs().layoutClass === cls,
        ),
      );

    // Icon paths: simplified Material "float left / center / float right / full width".
    layoutBtn("左侧环绕", "M3 5h6v6H3V5zm8 1h10v2H11V6zm0 4h10v2H11v-2zM3 14h18v2H3v-2zm0 4h18v2H3v-2z", "left-50");
    layoutBtn("居中（默认）", "M7 5h10v6H7V5zM3 14h18v2H3v-2zm0 4h18v2H3v-2z", null);
    layoutBtn("右侧环绕", "M15 5h6v6h-6V5zM3 6h10v2H3V6zm0 4h10v2H3v-2zm0 4h18v2H3v-2zm0 4h18v2H3v-2z", "right-50");
    layoutBtn("全宽", "M3 5h18v8H3V5zm0 10h18v2H3v-2zm0 4h18v2H3v-2z", "full-width");

    const divider = document.createElement("span");
    divider.className = "image-tool-divider";
    toolbar.appendChild(divider);
    toolbar.appendChild(sizeLabel);
    const divider2 = divider.cloneNode() as HTMLElement;
    toolbar.appendChild(divider2);

    button(
      "下载图片",
      "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
      () => {
        void window.electronAPI.downloadUrl(absoluteAttachmentUrl(attrs().src));
      },
    );
    button(
      "删除图片",
      "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
      () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") return;
        editor
          .chain()
          .focus()
          .deleteRange({ from: pos, to: pos + currentNode.nodeSize })
          .run();
      },
    );

    const refreshActive = () => {
      for (const { btn, isActive } of layoutButtons) {
        btn.classList.toggle("active", !!isActive?.());
      }
    };

    /* side handles: drag to resize, aspect ratio preserved */
    const startResize = (e: MouseEvent, dir: 1 | -1) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = img.getBoundingClientRect().width;
      const naturalRatio =
        img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null;
      const maxWidth = dom.parentElement?.getBoundingClientRect().width ?? 2000;
      let lastWidth = Math.round(startWidth);
      document.body.classList.add("image-resizing");
      const onMove = (ev: MouseEvent) => {
        lastWidth = Math.round(
          Math.min(
            maxWidth,
            Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX) * dir * 2),
          ),
        );
        img.style.width = `${lastWidth}px`;
        const h = naturalRatio ? Math.round(lastWidth * naturalRatio) : null;
        sizeLabel.textContent = h ? `${lastWidth} × ${h}` : `${lastWidth}`;
      };
      const onUp = () => {
        document.body.classList.remove("image-resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        commit({
          width: lastWidth,
          height: naturalRatio ? Math.round(lastWidth * naturalRatio) : null,
        });
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };
    handleRight.addEventListener("mousedown", (e) => startResize(e, 1));
    handleLeft.addEventListener("mousedown", (e) => startResize(e, -1));

    applyAttrs();
    refreshActive();

    return {
      dom,
      selectNode() {
        dom.classList.add("ProseMirror-selectednode");
        refreshActive();
      },
      deselectNode() {
        dom.classList.remove("ProseMirror-selectednode");
      },
      update(updated) {
        if (updated.type !== currentNode.type) return false;
        currentNode = updated;
        applyAttrs();
        refreshActive();
        return true;
      },
      stopEvent(event) {
        // let clicks on the toolbar/handles run our handlers, not PM's
        return (
          toolbar.contains(event.target as Node) ||
          handleLeft === event.target ||
          handleRight === event.target
        );
      },
      ignoreMutation() {
        return true;
      },
    };
  };
}

interface SerializerState {
  write(content: string): void;
}

export const AttachmentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null },
      height: { default: null },
      layoutClass: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (el) => {
          const e = el as HTMLImageElement;
          // markdown-it renders the raw title attribute — decode the web
          // conventions ("layoutClass =WxH") into structured attrs.
          const parsed = parseImageTitle(e.getAttribute("title"));
          return {
            src: e.getAttribute("src"),
            alt: e.getAttribute("alt"),
            title: parsed.title,
            width: parsed.width,
            height: parsed.height,
            layoutClass: parsed.layoutClass,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const a = node.attrs as ImageAttrs;
    return [
      "img",
      {
        src: absoluteAttachmentUrl(a.src),
        alt: a.alt ?? undefined,
        // keep the encoded title so copy/paste round-trips through parseHTML
        title: composeImageTitle(a) || undefined,
        width: a.width ?? undefined,
        class: a.layoutClass ? `image-${a.layoutClass}` : undefined,
      },
    ];
  },

  addNodeView() {
    return createImageView();
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: SerializerState, node: { attrs: ImageAttrs }) {
          const a = node.attrs;
          const alt = (a.alt ?? "").replace(/[[\]\n]/g, " ");
          const src = a.src.replace(/[()]/g, "\\$&");
          const title = composeImageTitle(a);
          state.write(
            `![${alt}](${src}${title ? ` "${title.replace(/"/g, '\\"')}"` : ""})`,
          );
        },
        parse: {},
      },
    };
  },
});
