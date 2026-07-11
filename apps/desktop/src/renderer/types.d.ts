/// <reference types="vite/client" />

declare module "markdown-it-task-lists" {
  import type { PluginWithOptions } from "markdown-it";
  const taskLists: PluginWithOptions<{
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }>;
  export default taskLists;
}

declare module "markdown-it-mark" {
  import type { PluginSimple } from "markdown-it";
  const mark: PluginSimple;
  export default mark;
}

declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
