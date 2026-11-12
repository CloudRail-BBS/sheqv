import Link from 'next/link';
import { fmtNum, gameLabel, gameTone, type ResourceView } from '@/lib/resource-types';
import { catLabel, type ContentCategory } from '@/lib/category-types';

/**
 * 资源卡（参考资源广场的竖版卡）：
 *
 * 大图封面 → 标题 → 两行简介 → 版本 / 加载器 / 分类胶囊 → 页脚（版本号 + 下载量）。
 * 一眼要能回答「这是什么、跑在什么环境下、多少人在用」；作者与团队在详情页与悬浮卡里看。
 */
export function ResourceCard({
  item,
  categories,
}: {
  item: ResourceView;
  categories?: ContentCategory[];
}) {
  const tone = gameTone(item.game);
  const versions = splitList(item.gameVersions).slice(0, 2);
  const loaders = splitList(item.loaders).slice(0, 2);
  // 分类和标签偶尔同名（比如都叫「光影」），去重后再截
  const chips = Array.from(
    new Set(
      [...versions, ...loaders, catLabel(categories, item.category), ...item.tags.slice(0, 2)].filter(
        Boolean,
      ),
    ),
  );
  const shownChips = chips.slice(0, 5);

  return (
    <Link href={`/resources/${item.id}`} className="card res-card">
      <div className={'res-cover cover-' + tone + (item.cover ? ' has-img' : '')}>
        {item.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="res-cover-img"
            src={item.cover}
            alt=""
            loading="lazy"
            decoding="async"
          />
        )}
        <span className={'badge badge-' + tone + ' res-cover-tag'}>{gameLabel(item.game)}</span>
      </div>

      <div className="res-body">
        <div className="res-title">{item.title}</div>
        {item.summary && <p className="res-desc">{item.summary}</p>}

        {shownChips.length > 0 && (
          <div className="res-chips">
            {shownChips.map((c) => (
              <span key={c} className="res-chip">{c}</span>
            ))}
          </div>
        )}

        <div className="res-foot">
          <span className="res-foot-ver mono">{item.version ? `v${item.version}` : ''}</span>
          <span className="res-foot-dl mono">
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path
                d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {fmtNum(item.downloadCount)}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** 「1.20.1, 1.20.4」「Forge / Fabric」统一拆成数组 */
export function splitList(raw: string): string[] {
  return raw
    .split(/[,，、/|]+|\s{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}
