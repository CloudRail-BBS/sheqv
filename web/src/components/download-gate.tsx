'use client';

import { useState } from 'react';

interface Props {
  title: string;
  sizeLabel: string;
  directDownload: boolean;
  isWeChat: boolean;
  externalHint: boolean;
}

/**
 * 下载入口的端能力门禁。
 * cap.resource.directDownload === false → 不渲染下载动作，改为"打开方式"说明。
 * 这是清单 §三「下载」那一行的真实实现。
 */
export function DownloadGate({ title, sizeLabel, directDownload, isWeChat, externalHint }: Props) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [collected, setCollected] = useState(false);

  function start() {
    if (!directDownload) {
      setOpen(true);
      return;
    }
    setProgress(0);
    const timer = setInterval(() => {
      setProgress((p) => {
        const next = (p ?? 0) + 9;
        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }
        return next;
      });
    }, 90);
  }

  return (
    <>
      <button className="btn btn-primary" style={{ width: '100%', height: 42 }} onClick={start}>
        {directDownload ? `下载 · ${sizeLabel}` : '获取资源'}
      </button>

      {progress !== null && (
        <div style={{ marginTop: 10 }}>
          <div className="meter">
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {progress >= 100 ? '已加入下载队列（演示）' : `预签名直传通道 · ${progress}%`}
          </div>
        </div>
      )}

      {!directDownload && (
        <div className="small muted" style={{ marginTop: 8 }}>
          当前形态不支持直下，仅可预览与收藏
        </div>
      )}

      <button
        className="btn btn-ghost btn-sm"
        style={{ width: '100%', marginTop: 8 }}
        onClick={() => setCollected((v) => !v)}
      >
        {collected ? '已收藏' : '收藏到我的合集'}
      </button>

      {open && (
        <div className="modal-mask" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16 }}>在当前浏览器里无法直接下载</h3>
            <p className="small dim" style={{ marginTop: 8 }}>
              「{title}」{sizeLabel}。这是端能力限制，不是权限问题：
              <code className="mono" style={{ color: 'var(--amber)' }}> cap.resource.directDownload = false</code>
            </p>
            <ol className="steps">
              <li>
                {isWeChat ? '点微信右上角「···」' : '点浏览器菜单'}
                <span className="muted"> — 选择「在浏览器打开」</span>
              </li>
              <li>在浏览器中重新打开本页</li>
              <li>此时下载按钮可用，也可直接用 App 打开</li>
            </ol>
            <div className="notice" style={{ marginTop: 14 }}>
              <span>{externalHint ? '微信内已启用 externalBrowserHint 引导' : '当前不支持直下'}</span>
            </div>
            <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>知道了</button>
              <button className="btn btn-primary" onClick={() => setCollected(true)}>先收藏</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
