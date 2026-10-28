-- 0021：关于社区的人员与合作单位
--
-- 一张表两种 kind：person（成员/贡献者）与 partner（合作单位）。
-- 字段取并集：人员用 role/bio/avatar，合作单位用 url/avatar（logo）。
-- 分开两张表会更「纯」，但后台要维护两套 CRUD，收益不抵成本。

CREATE TABLE IF NOT EXISTS about_entries (
    id         text PRIMARY KEY,
    kind       text NOT NULL,
    name       text NOT NULL,
    role       text NOT NULL DEFAULT '',
    bio        text NOT NULL DEFAULT '',
    avatar     text NOT NULL DEFAULT '',
    url        text NOT NULL DEFAULT '',
    sort       integer NOT NULL DEFAULT 0,
    visible    boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT about_kind_check CHECK (kind IN ('person', 'partner'))
);

CREATE INDEX IF NOT EXISTS about_kind_idx ON about_entries (kind, sort, created_at);
