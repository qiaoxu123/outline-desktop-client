# 待办（Todo）设计 + 实现计划

> 状态：已批准（用户「你来设计，开始实现」）· 目标版本 v1.13.0

## 决策
- **个人私有**，WebDAV `待办/<userId>.json`（同随记私有模型）。
- **完整字段**：文本 + 完成勾选 + 截止日期 + 优先级(高/中/低) + `#标签`。
- **集成**：关联 Outline 文档（复用随记 DocPicker）；读文档时「＋待办」预关联本文。不做随记转待办、不做桌面提醒。
- **智能分组**：已逾期 / 今天 / 即将(7 天) / 无期限 / 已完成(折叠)。
- **抽取通用 `useWebdavStore`** 给随记 + 待办共用。
- 删除走**软删除 + 回收站**（30 天清理）。

## 存储结构
```json
{ "version": 1, "todos": [{
  "id","text","done":false,"completedAt":null,
  "dueDate":"YYYY-MM-DD"|null,"priority":"high"|"mid"|"low"|null,
  "tags":[],"createdAt","updatedAt","deletedAt":null,
  "links":[{"docId","urlId","title"}]
}] }
```

## 通用存储 `hooks/useWebdavStore.ts`
泛型 `<T extends {id;updatedAt;deletedAt}>`，封装：WebDAV get/put（现成 IPC）、localStorage 镜像、初次 cache 秒开→远端 purge、写入串行链（re-GET → mergeById → purge → put）。暴露 `{items,loading,error,userId,commit(mutate),reload}`。随记 `useNotes` 重构为其之上的薄封装（API 不变），待办 `useTodos` 同构。

## 分组/排序（未完成）
- 组：`overdue`(dueDate<今天) → `today`(=今天) → `soon`(今天<due≤+7d) → `later`(>+7d) → `none`(无 due)。
- 组内：优先级 高→中→低→无，再按 dueDate 升序，再 createdAt 升序。
- 已完成：单独折叠区，按 completedAt 倒序。

## 文件
- 新增 `hooks/useWebdavStore.ts`；重构 `features/notes/useNotes.ts`（用它），从 `noteUtils.ts` 移除 mergeNotes/purgeExpired。
- 新增 `features/todos/{types.ts,todoUtils.ts,useTodos.ts,TodoComposer.tsx,TodoRow.tsx,TodosView.tsx,TodosView.css,QuickTodoPopover.tsx}`；复用 `notes/DocPicker.tsx`、`noteUtils.parseTags`。
- 改 `App.tsx`(路由)、`Sidebar.tsx`(navItem, `todoList` 图标)、`DocumentView.tsx`(「＋待办」按钮)。

## 验证
- `tsc --noEmit` + `build`；CDP：先回归随记(add+reload 不坏)，再走查待办 增/勾完成/改截止优先级/关联/软删恢复/分组/导出/多设备合并；清理测试数据。
- 发版 v1.13.0（GitHub Action）安装。
