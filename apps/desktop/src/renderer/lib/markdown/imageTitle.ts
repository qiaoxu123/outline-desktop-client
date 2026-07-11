/**
 * Outline web encodes image layout and size in the markdown title:
 * `![alt](src "layoutClass =WxH")` — e.g. `![图](url "full-width =875x385")`.
 * (shared/editor/nodes/Image.tsx parseTitleAttribute / toMarkdown.)
 */

export const IMAGE_LAYOUT_CLASSES = ["right-50", "left-50", "full-width"] as const;
export type ImageLayoutClass = (typeof IMAGE_LAYOUT_CLASSES)[number];

const imageSizeRegex = /\s=(\d+)?x(\d+)?$/;

export interface ParsedImageTitle {
  layoutClass: ImageLayoutClass | null;
  width: number | null;
  height: number | null;
  title: string | null;
}

export function parseImageTitle(tokenTitle: string | null): ParsedImageTitle {
  let rest = tokenTitle ?? "";
  let layoutClass: ImageLayoutClass | null = null;
  let width: number | null = null;
  let height: number | null = null;

  for (const cls of IMAGE_LAYOUT_CLASSES) {
    if (rest.includes(cls)) {
      layoutClass = cls;
      rest = rest.replace(cls, "").trim();
      break;
    }
  }

  const size = imageSizeRegex.exec(rest);
  if (size) {
    width = size[1] ? parseInt(size[1], 10) : null;
    height = size[2] ? parseInt(size[2], 10) : null;
    rest = rest.replace(imageSizeRegex, "").trim();
  }

  return { layoutClass, width, height, title: rest || null };
}

export function composeImageTitle(attrs: {
  layoutClass?: string | null;
  width?: number | null;
  height?: number | null;
  title?: string | null;
}): string {
  // layoutClass takes the title slot (web behaviour); size appends as ` =WxH`.
  const base = attrs.layoutClass ?? attrs.title ?? "";
  const size =
    attrs.width || attrs.height
      ? ` =${attrs.width ?? ""}x${attrs.height ?? ""}`
      : "";
  return `${base}${size}`.trim() === "" ? "" : `${base}${size}`;
}
