-- 0018：客户端版本发布（Windows / macOS / Android）
CREATE TABLE IF NOT EXISTS app_releases (
    id           text PRIMARY KEY,
    platform     text NOT NULL,
    channel      text NOT NULL DEFAULT 'stable',
    version      text NOT NULL,
    build        integer NOT NULL DEFAULT 1,
    download_url text NOT NULL,
    notes        text NOT NULL DEFAULT '',
    force_update boolean NOT NULL DEFAULT false,
    min_version  text NOT NULL DEFAULT '',
    published    boolean NOT NULL DEFAULT true,
    file_size    bigint NOT NULL DEFAULT 0,
    sha256       text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_platform_check CHECK (platform IN ('windows-x64','windows-arm64','macos-arm64','macos-x64','android')),
    CONSTRAINT app_channel_check CHECK (channel IN ('stable','beta'))
);
CREATE UNIQUE INDEX IF NOT EXISTS app_release_unique ON app_releases (platform, channel, build);
CREATE INDEX IF NOT EXISTS app_release_latest ON app_releases (platform, channel, published, build DESC);
