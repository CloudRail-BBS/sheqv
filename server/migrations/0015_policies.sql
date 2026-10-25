-- 0015：站内政策（用户协议 / 免责声明 / 隐私政策等）
CREATE TABLE IF NOT EXISTS policies (
    slug         text PRIMARY KEY,
    title        text NOT NULL,
    summary      text NOT NULL DEFAULT '',
    body         text NOT NULL DEFAULT '',
    version      text NOT NULL DEFAULT 'v1',
    published    boolean NOT NULL DEFAULT true,
    show_on_cert boolean NOT NULL DEFAULT false,
    builtin      boolean NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS policies_public ON policies (published, updated_at DESC);
