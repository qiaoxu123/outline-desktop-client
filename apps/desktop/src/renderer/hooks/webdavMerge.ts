/**
 * WebDAV 存储的纯合并逻辑（随记 / 待办 / 大纲共用）。
 *
 * 与 `useWebdavStore` 分开放：这里不依赖 React / zustand / localStorage，
 * 可以直接在 node 环境下单测——数据丢失级的合并规则必须有测试兜着。
 */

/** Minimum shape every stored item must satisfy for merge/soft-delete. */
export interface StoreItem {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

/** Union by id; on the same id keep the newer updatedAt. */
export function mergeById<T extends StoreItem>(local: T[], remote: T[]): T[] {
  const byId = new Map<string, T>();
  for (const n of remote) byId.set(n.id, n);
  for (const n of local) {
    const prev = byId.get(n.id);
    if (!prev || n.updatedAt >= prev.updatedAt) byId.set(n.id, n);
  }
  return [...byId.values()];
}

export function purgeExpired<T extends StoreItem>(
  items: T[],
  nowMs: number,
): T[] {
  return items.filter(
    (n) => !n.deletedAt || nowMs - new Date(n.deletedAt).getTime() < THIRTY_DAYS,
  );
}

/**
 * 决定一次远端拉取的结果该如何落地。
 *
 * 拉取可能耗时数秒（经坚果云）。若期间发生过本地 commit，远端返回的是**变更
 * 之前**的快照：直接覆盖会让刚记下的条目从 UI 和缓存里消失，且后台 PUT 读到
 * 被覆盖的本地状态，导致它永远不被上传（随手记场景下的真实数据丢失）。
 *
 * 期间无本地变更时仍以远端为准——否则本地缓存里被别的设备硬删除的条目会复活。
 */
export function resolveRemoteSnapshot<T extends StoreItem>(
  local: T[],
  remote: T[],
  changedDuringFetch: boolean,
  nowMs: number,
): T[] {
  const purged = purgeExpired(remote, nowMs);
  return changedDuringFetch
    ? purgeExpired(mergeById(local, purged), nowMs)
    : purged;
}
