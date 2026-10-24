-- 0005：联机大厅（我的世界服务器 / 铁锈战争联机房）
--
-- 两类条目共用一张表，靠 kind 区分，因为它们除了「上传 + 展示 + 状态」之外
-- 没有别的差异；分表会让大厅的排序、分页、后台管理都得写两遍。
--
-- 探测结果直接落在行上（快照式）：大厅只读快照，永远不会在请求里等 TCP/UDP。
-- 后台任务按 probed_at 轮转刷新，所以 probed_at 既是展示字段也是调度依据。

CREATE TABLE IF NOT EXISTS game_servers (
    id              text PRIMARY KEY,
    -- minecraft / rusted_warfare
    kind            text NOT NULL,
    name            text NOT NULL,
    -- MC：主机名或 IP；RW：中转站根地址（形如 http://1.2.3.4:46784）
    host            text NOT NULL,
    -- MC 的端口；RW 恒为 0（端口在 host 的 URL 里）
    port            integer NOT NULL DEFAULT 0,
    -- java / bedrock；铁锈战争条目留空（它没有"版本"）
    edition         text NOT NULL DEFAULT 'java',
    description     text NOT NULL DEFAULT '',
    tags            jsonb NOT NULL DEFAULT '[]'::jsonb,
    owner_id        text REFERENCES users (id) ON DELETE SET NULL,
    -- 用户自由上传，默认直接展示；管理员可隐藏（不删除数据）
    visibility      text NOT NULL DEFAULT 'public',
    -- 探测快照
    probe_state     text NOT NULL DEFAULT 'unknown',
    probe_error     text NOT NULL DEFAULT '',
    players_online  integer NOT NULL DEFAULT 0,
    players_max     integer NOT NULL DEFAULT 0,
    version_name    text NOT NULL DEFAULT '',
    motd            text NOT NULL DEFAULT '',
    latency_ms      integer NOT NULL DEFAULT 0,
    probed_at       timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT game_servers_kind_check CHECK (kind IN ('minecraft', 'rusted_warfare')),
    CONSTRAINT game_servers_edition_check CHECK (edition IN ('java', 'bedrock', '')),
    CONSTRAINT game_servers_visibility_check CHECK (visibility IN ('public', 'hidden')),
    CONSTRAINT game_servers_probe_check CHECK (probe_state IN ('unknown', 'online', 'offline'))
);

CREATE INDEX IF NOT EXISTS game_servers_kind ON game_servers (kind, visibility, created_at DESC);

-- 同一个地址不允许重复上传：MC 按 host+port，RW 按整条 URL。
-- 用 lower(host) 是为了让大小写不同的域名算同一个，否则能刷出一堆同款条目。
CREATE UNIQUE INDEX IF NOT EXISTS game_servers_target
    ON game_servers (kind, lower(host), port);

-- 探测调度：只挑公开且该刷新了的行，按最久没探测的优先
CREATE INDEX IF NOT EXISTS game_servers_due
    ON game_servers (probed_at NULLS FIRST)
    WHERE visibility = 'public';
