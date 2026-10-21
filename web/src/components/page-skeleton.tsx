/**
 * 路由级骨架屏（供各段的 loading.tsx 复用）。
 *
 * ⚠️ 放 loading.tsx 的位置很关键：
 * loading 会在该**路由段**外创建 Suspense 边界，一旦边界存在，
 * React 会先 flush 出 HTML 外壳（HTTP 200），之后页面里再调 notFound()
 * 就只能改内容、改不了状态码 —— 表现是"404 页面返回 200"。
 *
 * 所以规则是：
 *  - 有 `[id]` 详情子页的目录（resources / matches / announcements / p），
 *    列表页要放进 `(list)` 路由组，loading.tsx 只放在组内；
 *  - 详情页那一段**不能有** loading.tsx；
 *  - 根级 `app/loading.tsx` 会包裹全站（含所有详情页），不要放。
 */
export function PageSkeleton({ rail = true }: { rail?: boolean }) {
  return (
    <div className="cols" aria-busy="true" aria-live="polite" aria-label="加载中">
      <div className="col-main">
        <div className="sk sk-title" />
        <div className="sk sk-hero" />
        <div className="sk sk-block" style={{ height: 96 }} />
        <div className="sk sk-block" style={{ height: 132 }} />
        <div className="sk sk-block" style={{ height: 132 }} />
      </div>
      {rail && (
        <aside className="rail">
          <div className="sk sk-rail" style={{ height: 148 }} />
          <div className="sk sk-rail" style={{ height: 196 }} />
        </aside>
      )}
    </div>
  );
}
