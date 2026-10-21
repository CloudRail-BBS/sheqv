'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** 运行时错误边界：给出可执行的下一步，而不是一屏堆栈 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 生产环境这里可以接 Sentry 之类的上报；先保留控制台
    console.error('[app]', error);
  }, [error]);

  return (
    <div className="cols">
      <div className="col-main">
        <div className="card card-pad" style={{ maxWidth: 520, margin: '28px auto 0' }}>
          <h1 className="page-title" style={{ fontSize: 19 }}>
            页面出错了
          </h1>
          <p className="small muted" style={{ marginTop: 8, lineHeight: 1.8 }}>
            这次请求没有完成。可以先重试；如果一直失败，把下面的编号发给管理员，方便在服务端日志里定位。
          </p>
          {error.digest && (
            <p className="mono small" style={{ marginTop: 10, color: 'var(--muted)' }}>
              digest: {error.digest}
            </p>
          )}
          <div className="row" style={{ gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={reset} style={{ flex: 1 }}>
              重试
            </button>
            <Link href="/" className="btn" style={{ flex: 1 }}>
              回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
