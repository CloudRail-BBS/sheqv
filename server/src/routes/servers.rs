//! 联机大厅接口。
//!
//! 公开读 + 登录上传；编辑/删除限本人或管理员，隐藏/恢复只在后台。
//! Rusted Warfare 的房间不进库，每次现取（带 10 秒缓存），所以这里也没有房间的写接口。

use std::collections::HashMap;
use std::time::Duration;

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};
use tokio::task::JoinSet;

use crate::current_user::MaybeUser;
use crate::errors::{ApiError, ApiResult};
use crate::groups;
use crate::servers::{self, NewServer, PatchServer, ServerError, ServerView};
use crate::state::AppState;
use crate::users::PublicUser;
use crate::{mcping, relay};

/// 单用户最多上传多少个，防刷
const MAX_PER_USER: i64 = 20;
/// 同一台服务器的刷新冷却：按钮连点不该变成对目标的小型压测
const REFRESH_COOLDOWN_MS: i64 = 10_000;

fn parse_body(body: &Bytes) -> Option<Map<String, Value>> {
    serde_json::from_slice::<Value>(body)
        .ok()?
        .as_object()
        .cloned()
}

fn text(obj: &Map<String, Value>, key: &str) -> String {
    obj.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn strings(obj: &Map<String, Value>, key: &str) -> Vec<String> {
    obj.get(key)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

fn server_err(e: ServerError) -> ApiError {
    match e {
        ServerError::NotFound => ApiError::not_found(),
        ServerError::Duplicate => ApiError::with_message(
            StatusCode::CONFLICT,
            "duplicate_server",
            "这个地址已经有人上传过了",
        ),
        ServerError::Invalid(msg) => ApiError::invalid_input(msg),
        ServerError::Db(err) => ApiError::internal(err),
    }
}

fn need_login() -> ApiError {
    ApiError::with_message(StatusCode::FORBIDDEN, "need_login", "请先登录")
}

fn forbidden(msg: &str) -> ApiError {
    ApiError::with_message(StatusCode::FORBIDDEN, "no_permission", msg)
}

/// 上传要求：登录 + 所属身份组有 `post.create`（被限制的组连帖子都发不了，更不该发服务器）
async fn require_uploader(st: &AppState, user: &PublicUser) -> ApiResult<()> {
    if groups::can(&st.pool, &user.id, "post.create")
        .await
        .map_err(ApiError::internal)?
    {
        Ok(())
    } else {
        Err(forbidden("当前身份组没有上传权限"))
    }
}

/* ── 公开 ───────────────────────────────── */

/// GET /api/v1/servers?kind=minecraft|rusted_warfare
pub async fn list(
    State(st): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let kind = q
        .get("kind")
        .map(|k| k.trim().to_lowercase())
        .filter(|k| !k.is_empty());
    if let Some(k) = &kind {
        if !servers::KINDS.contains(&k.as_str()) {
            return Err(ApiError::invalid_input("类型只能是 minecraft 或 rusted_warfare"));
        }
    }

    let items = servers::list(&st.pool, kind.as_deref(), false)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/servers —— 自由上传，登录即可
pub async fn create(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    require_uploader(&st, &user).await?;

    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let mut input = NewServer {
        kind: text(&obj, "kind"),
        name: text(&obj, "name"),
        host: text(&obj, "host"),
        port: obj.get("port").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        edition: text(&obj, "edition"),
        description: text(&obj, "description"),
        tags: strings(&obj, "tags"),
    };

    servers::validate(&mut input).map_err(ApiError::invalid_input)?;

    let owned: i64 = sqlx::query_scalar("SELECT count(*) FROM game_servers WHERE owner_id = $1")
        .bind(&user.id)
        .fetch_one(&st.pool)
        .await
        .map_err(ApiError::internal)?;
    if owned >= MAX_PER_USER {
        return Err(forbidden(&format!(
            "每人最多上传 {MAX_PER_USER} 个，先删掉不用的"
        )));
    }

    // 上传时只做「地址合法 + 公网」的预检，不做可达性探测——
    // 探测要 5 秒，放进请求里会让上传按钮转圈到怀疑人生。
    servers::precheck(&input).await.map_err(ApiError::invalid_input)?;

    let item = servers::create(&st.pool, &user.id, &input)
        .await
        .map_err(server_err)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "ok": true,
            "item": item,
            "message": "已提交，管理员审核通过后会出现在大厅",
        })),
    )
        .into_response())
}

/// PATCH /api/v1/servers/{id} —— 本人或管理员
pub async fn patch(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    let current = servers::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    require_owner_or_admin(&user, &current)?;

    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    // 复用整表校验：把「现有的值 + 改动」合成一份再校验，避免逐字段写一遍规则
    let mut merged = NewServer {
        kind: current.kind.clone(),
        name: obj
            .get("name")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| current.name.clone()),
        host: obj
            .get("host")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| current.host.clone()),
        port: obj
            .get("port")
            .and_then(Value::as_i64)
            .map(|v| v as i32)
            .unwrap_or(current.port),
        edition: obj
            .get("edition")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| current.edition.clone()),
        description: obj
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| current.description.clone()),
        tags: match obj.get("tags") {
            Some(_) => strings(&obj, "tags"),
            None => current.tags.clone(),
        },
    };
    servers::validate(&mut merged).map_err(ApiError::invalid_input)?;

    let patch = PatchServer {
        name: obj.get("name").map(|_| merged.name.clone()),
        host: obj.get("host").map(|_| merged.host.clone()),
        port: obj.get("port").map(|_| merged.port),
        edition: obj.get("edition").map(|_| merged.edition.clone()),
        description: obj.get("description").map(|_| merged.description.clone()),
        tags: obj.get("tags").map(|_| merged.tags.clone()),
        // 只有管理员能改可见性与审核结果
        visibility: None,
        status: None,
    };

    let item = servers::update(&st.pool, &id, &patch)
        .await
        .map_err(server_err)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/servers/{id}
pub async fn remove(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    let current = servers::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    require_owner_or_admin(&user, &current)?;

    servers::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true })).into_response())
}

/// GET /api/v1/me/servers —— 我提交的条目（含待审核 / 被拒）
pub async fn mine(
    State(st): State<AppState>,
    crate::current_user::CurrentUser(user): crate::current_user::CurrentUser,
) -> ApiResult<Response> {
    let items = servers::list_mine(&st.pool, &user.id)
        .await
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// POST /api/v1/servers/{id}/probe —— 手动刷新一次（10 秒冷却）
pub async fn refresh(
    State(st): State<AppState>,
    MaybeUser(maybe): MaybeUser,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    let user = maybe.ok_or_else(need_login)?;
    let current = servers::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    require_owner_or_admin(&user, &current)?;

    let fresh = current
        .probed_at
        .map(|at| (chrono::Utc::now().timestamp_millis() - at).abs() < REFRESH_COOLDOWN_MS)
        .unwrap_or(false);
    if !fresh {
        let target = servers::Target {
            id: current.id.clone(),
            kind: current.kind.clone(),
            host: current.host.clone(),
            port: current.port,
            edition: current.edition.clone(),
        };
        servers::probe_and_store(&st, &target).await;
    }

    let item = servers::get(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// GET /api/v1/relay/rooms —— 所有中转站的实时房间
///
/// 没有用户上传中转站时回落到内置的官方中转站（`RW_RELAY_URL`），
/// 让空站的大厅也有内容；一旦有人上传，就以用户上传的为准。
pub async fn rooms(State(st): State<AppState>) -> ApiResult<Response> {
    let mut bases: Vec<(String, String)> = servers::list(&st.pool, Some("rusted_warfare"), false)
        .await
        .map_err(ApiError::internal)?
        .into_iter()
        .map(|s| (s.host, s.name))
        .collect();

    if bases.is_empty() {
        bases.push((st.cfg.rw_relay_url.clone(), "官方中转站".to_string()));
    }

    // 同一地址只拉一次（唯一索引已经拦了重复，这里再兜一层）
    bases.sort_by(|a, b| a.0.cmp(&b.0));
    bases.dedup_by(|a, b| a.0 == b.0);

    let mut set = JoinSet::new();
    for (url, label) in bases {
        let client = st.http.clone();
        let cache = st.relay.clone();
        set.spawn(async move {
            let mut node = cache.snapshot(&client, &url, relay::CACHE_TTL).await;
            if node.name.is_empty() {
                node.name = label;
            }
            node
        });
    }

    let mut nodes = Vec::new();
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok(node) => nodes.push(node),
            Err(e) => tracing::warn!(error = %e, "聚合中转站失败"),
        }
    }
    // 稳定顺序：先可用的，再按房间数、人数
    nodes.sort_by(|a, b| {
        b.ok.cmp(&a.ok)
            .then(b.rooms.len().cmp(&a.rooms.len()))
            .then(a.name.cmp(&b.name))
    });

    let total_rooms: usize = nodes.iter().map(|n| n.rooms.len()).sum();
    let total_players: i64 = nodes
        .iter()
        .flat_map(|n| n.rooms.iter())
        .map(|r| r.players)
        .sum();

    Ok(Json(json!({
        "ok": true,
        "nodes": nodes,
        "totalRooms": total_rooms,
        "totalPlayers": total_players,
    }))
    .into_response())
}

fn require_owner_or_admin(user: &PublicUser, server: &ServerView) -> ApiResult<()> {
    if user.is_admin || server.owner_id.as_deref() == Some(user.id.as_str()) {
        Ok(())
    } else {
        Err(forbidden("只有上传者或管理员能改这个条目"))
    }
}

/* ── 后台 ───────────────────────────────── */

/// GET /api/v1/admin/servers —— 含隐藏条目
pub async fn admin_list(
    State(st): State<AppState>,
    _: crate::admin_auth::AdminActor,
) -> ApiResult<Response> {
    let mut items = servers::list(&st.pool, None, true)
        .await
        .map_err(ApiError::internal)?;
    // 待审核排前面：后台打开就想先处理队列，而不是翻过一堆已通过的
    items.sort_by(|a, b| {
        let rank = |s: &ServerView| if s.status == "pending" { 0 } else { 1 };
        rank(a).cmp(&rank(b)).then(b.created_at.cmp(&a.created_at))
    });
    Ok(Json(json!({ "ok": true, "items": items })).into_response())
}

/// PATCH /api/v1/admin/servers/{id}
///
/// body 二选一或同时给：`{ visibility: public|hidden }` 控制展示，
/// `{ status: pending|approved|rejected }` 是审核结果。
pub async fn admin_patch(
    State(st): State<AppState>,
    _: crate::admin_auth::AdminActor,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult<Response> {
    let Some(obj) = parse_body(&body) else {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "invalid_json"));
    };

    let visibility = obj
        .get("visibility")
        .and_then(Value::as_str)
        .map(str::trim)
        .map(str::to_string);
    if let Some(v) = visibility.as_deref() {
        if v != "public" && v != "hidden" {
            return Err(ApiError::invalid_input("visibility 只能是 public 或 hidden"));
        }
    }

    let status = obj
        .get("status")
        .and_then(Value::as_str)
        .map(str::trim)
        .map(str::to_string);
    if let Some(v) = status.as_deref() {
        if !["pending", "approved", "rejected"].contains(&v) {
            return Err(ApiError::invalid_input(
                "status 只能是 pending / approved / rejected",
            ));
        }
    }

    if visibility.is_none() && status.is_none() {
        return Err(ApiError::invalid_input("请提供 visibility 或 status"));
    }

    let patch = PatchServer {
        visibility,
        status,
        ..Default::default()
    };
    let item = servers::update(&st.pool, &id, &patch)
        .await
        .map_err(server_err)?
        .ok_or_else(ApiError::not_found)?;

    Ok(Json(json!({ "ok": true, "item": item })).into_response())
}

/// DELETE /api/v1/admin/servers/{id}
pub async fn admin_delete(
    State(st): State<AppState>,
    _: crate::admin_auth::AdminActor,
    Path(id): Path<String>,
) -> ApiResult<Response> {
    if !servers::delete(&st.pool, &id)
        .await
        .map_err(ApiError::internal)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({ "ok": true })).into_response())
}

/// GET /api/v1/admin/servers/probe —— 管理员当场探一次（不看冷却）
///
/// 给「上传完想知道通不通」的场景用：大厅要等后台循环，这里能立刻看到结果。
pub async fn admin_probe(
    _: crate::admin_auth::AdminActor,
    Query(q): Query<HashMap<String, String>>,
) -> ApiResult<Response> {
    let host = q.get("host").map(|s| s.trim().to_string()).unwrap_or_default();
    let port: u16 = q
        .get("port")
        .and_then(|p| p.parse().ok())
        .unwrap_or(25565);
    let edition = q
        .get("edition")
        .map(|s| s.as_str())
        .unwrap_or("java")
        .to_string();

    let started = std::time::Instant::now();
    let result = tokio::time::timeout(
        Duration::from_secs(8),
        mcping::probe(&host, port, &edition),
    )
    .await;

    Ok(Json(json!({
        "ok": true,
        "elapsedMs": started.elapsed().as_millis() as i64,
        "result": match result {
            Ok(Ok(status)) => json!({ "online": true, "status": status }),
            Ok(Err(err)) => json!({ "online": false, "error": err }),
            Err(_) => json!({ "online": false, "error": "探测超时" }),
        },
    }))
    .into_response())
}
