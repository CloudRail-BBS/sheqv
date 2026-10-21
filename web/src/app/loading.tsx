/**
 * 全局加载骨架。
 *
 * 路由级 loading 会在 RSC 数据到达前显示。骨架保持与真实页面相同的三栏结构，
 * 避免内容出现时整页跳动（CLS）——这比"转圈"体感更稳。
 */
export default function Loading() {
  return (
    <div className="cols" aria-busy="true" aria-live="polite" aria-label="加载中">
      <div className="col-main">
        <div className="sk sk-title" />
        <div className="sk sk-hero" />
        <div className="sk sk-block" style={{ height: 96 }} />
        <div className="sk sk-block" style={{ height: 132 }} />
        <div className="sk sk-block" style={{ height: 132 }} />
      </div>
      <aside className="rail">
        <div className="sk sk-rail" style={{ height: 148 }} />
        <div className="sk sk-rail" style={{ height: 196 }} />
      </aside>
    </div>
  );
}
