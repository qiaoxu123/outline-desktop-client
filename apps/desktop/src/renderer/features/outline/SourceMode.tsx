import { useState } from "react";
import { toMarkdown, parseMarkdown } from "./outlineSerialize";
import type { OutlineNode } from "./types";

export interface SourceModeProps {
  root: OutlineNode[];
  onApply: (next: OutlineNode[]) => void;
  onCancel: () => void;
}

export default function SourceMode(props: SourceModeProps): React.ReactElement {
  const [text, setText] = useState(() => toMarkdown(props.root));
  const [err, setErr] = useState<string | null>(null);

  const apply = () => {
    try {
      const parsed = parseMarkdown(text);
      setErr(null);
      props.onApply(parsed);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="ol-source">
      <div className="ol-source-bar">
        <span className="ol-source-hint">源码模式：往返会重建节点、折叠状态重置为全展开</span>
        <button onClick={apply}>应用并返回大纲</button>
        <button onClick={props.onCancel}>取消</button>
      </div>
      {err && <div className="ol-source-err">解析失败：{err}</div>}
      <textarea
        className="ol-source-area"
        value={text}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
