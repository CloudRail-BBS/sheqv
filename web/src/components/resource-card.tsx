import Link from 'next/link';
import { fmtNum, fmtSize, gameLabel, gameShort, gameTone, type ResourceView } from '@/lib/resource-types';

/**
 * 资源卡片。
 *
 * 作者名后面最多两个标记：开发者 + 团队简称。两者都不占太多宽度，
 * 卡片里真正要一眼看到的是「什么东西 / 谁做的 / 多少人用过」。
 */
export function ResourceCard({ item }: { item: ResourceView }) {
  const tone = gameTone(item.game);

  return (
    <Link href={`/resources/${item.id}`} className="card res-card">
      <div className={'res-cover cover-' + tone}>
        <span className={'badge badge-' + tone}>{gameLabel(item.game)}</span>
        <span className="glyph" aria-hidden="true">
          {gameShort(item.game)}
        </span>
        {item.version && <span className="ver">{item.version}</span>}
      </div>

      <div className="res-body">
        <div className="res-title">{item.title}</div>
        <div className="res-meta">
          <span>{item.category}</span>
          <span>·</span>
          <span className="res-author">
            {item.author}
            {item.authorDeveloper && <span className="dev-chip">开发者</span>}
          </span>
          {item.teamName && (
            <span className="team-chip" title={`开发团队：${item.teamName}`}>
              {item.teamTag || item.teamName}
            </span>
          )}
        </div>
        <div className="res-foot">
          <span className="small muted mono">
            ♥ {fmtNum(item.likeCount)} · ↓ {fmtNum(item.downloadCount)}
          </span>
          <span className="how">{fmtSize(item.sizeBytes)}</span>
        </div>
      </div>
    </Link>
  );
}
