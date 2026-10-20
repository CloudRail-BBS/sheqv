'use client';

import { useState } from 'react';

/** 仅开发环境：写 __form cookie 后刷新，用桌面浏览器验证移动形态 */
export function ForceSwitch({ current }: { current: 'desktop' | 'mobile' }) {
  const [busy, setBusy] = useState(false);

  function set(value: string | null) {
    setBusy(true);
    if (value) document.cookie = `__form=${value};path=/;max-age=3600`;
    else document.cookie = '__form=;path=/;max-age=0';
    location.reload();
  }

  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <span className="small muted">强制视口：</span>
      <button className="chip" data-on={current === 'desktop'} onClick={() => set('desktop')} disabled={busy}>
        桌面
      </button>
      <button className="chip" data-on={current === 'mobile'} onClick={() => set('mobile')} disabled={busy}>
        移动
      </button>
      <button className="chip" onClick={() => set(null)} disabled={busy}>
        自动
      </button>
    </div>
  );
}
