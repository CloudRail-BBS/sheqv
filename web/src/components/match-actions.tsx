'use client';

import { useState } from 'react';

interface Props {
  canVideo: boolean;
  evidenceVideoBytes: number;
  evidenceImageBytes: number;
  initialStatus: 'submitted' | 'disputed' | 'locked' | 'confirmed';
}

const fmt = (n: number) => (n >= 1024 * 1024 * 1024 ? `${(n / 1024 ** 3).toFixed(0)}GB` : `${Math.round(n / 1024 / 1024)}MB`);

/**
 * 比赛确权的前台交互。三处受能力表驱动：
 *  - 录像证据：cap.match.evidenceVideoUpload / limit('evidenceVideoBytes')
 *  - 确认按钮：仅 submitted 状态出现
 *  - 争议：进入后不可撤回，需二次确认
 */
export function MatchActions({ canVideo, evidenceVideoBytes, evidenceImageBytes, initialStatus }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'confirmed' | 'disputed'>('idle');
  const [scoreA, setScoreA] = useState(2);
  const [scoreB, setScoreB] = useState(1);
  const [videoUrl, setVideoUrl] = useState('');

  return (
    <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="between">
        <h3 style={{ fontSize: 14 }}>结果确认</h3>
        <span className="badge badge-warn">确认窗口 6 小时后到期</span>
      </div>

      <div className="row" style={{ gap: 10 }}>
        <label className="field grow">
          <span>星轨 比分</span>
          <input className="input" type="number" min={0} max={9} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} />
        </label>
        <label className="field grow">
          <span>玄武 比分</span>
          <input className="input" type="number" min={0} max={9} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} />
        </label>
      </div>

      <label className="field">
        <span>第 3 局录像{canVideo ? '（或上传文件）' : '（仅外链）'}</span>
        <input
          className="input"
          placeholder={canVideo ? 'https://… 或上传 ≤' + fmt(evidenceVideoBytes) : '粘贴录像外链，例如 B 站 / YouTube'}
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
        />
      </label>

      {!canVideo && (
        <div className="hint-box">
          当前形态 <code className="mono">cap.match.evidenceVideoUpload = false</code>
          ，<code className="mono">evidenceVideoBytes = 0</code>：录像只能贴外链，截图可直传（≤
          {fmt(evidenceImageBytes)}）。要传文件请用桌面端或 App。
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary grow" onClick={() => setConfirmOpen(true)} disabled={state !== 'idle'}>
          {state === 'confirmed' ? '已确认 · 计入战绩' : '确认结果'}
        </button>
        <button className="btn btn-ghost" onClick={() => setDisputeOpen(true)} disabled={state !== 'idle'}>
          {state === 'disputed' ? '已发起争议' : '比分不一致'}
        </button>
      </div>

      <p className="small muted">
        确认后即锁定，{initialStatus === 'submitted' ? '7 天内可申请一次更正，仍需仲裁复核' : '超时将自动按一致结果确认'}
        。
      </p>

      {confirmOpen && (
        <div className="modal-mask" onClick={() => setConfirmOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16 }}>确认 {scoreA} : {scoreB} ？</h3>
            <p className="small dim" style={{ marginTop: 8 }}>
              确认后本场结果锁定并计入公会战绩与积分，双方不可再修改。
            </p>
            <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>再看看</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setState('confirmed');
                  setConfirmOpen(false);
                }}
              >
                确认并锁定
              </button>
            </div>
          </div>
        </div>
      )}

      {disputeOpen && (
        <div className="modal-mask" onClick={() => setDisputeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: 16 }}>发起争议</h3>
            <p className="small dim" style={{ marginTop: 8 }}>
              进入争议后本场暂停计入战绩，双方各有一次举证机会，裁定由赛事组在管理后台完成。
            </p>
            <div className="hint-box" style={{ marginTop: 12 }}>
              必填：第 3 局截图（≤{fmt(evidenceImageBytes)}）+ 至少一条录像外链
            </div>
            <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDisputeOpen(false)}>取消</button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setState('disputed');
                  setDisputeOpen(false);
                }}
              >
                提交争议
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
