//! 用户上传的图片（头像 / 背景 / 帖子配图）。
//!
//! 存 PostgreSQL `user_media.bytes`，不落文件系统：备份脚本只跑 pg_dump，
//! 文件目录很容易漏备；单实例、2MB 以内，bytea 足够。
//! 对外统一走 `/api/v1/media/{id}`，与页面同源，Canvas 分享图不会跨域污染。

use std::io::Cursor;

use chrono::{DateTime, Utc};

use image::ImageEncoder;

use sqlx::PgPool;

use crate::object_storage;
use crate::state::AppState;

/// 单张图片上限 2MB
pub const MAX_BYTES: usize = 2 * 1024 * 1024;

/// 头像默认出图宽度：UI 最大 96px（2x 屏 192px），256 留足余量
pub const AVATAR_WIDTH: u32 = 256;
/// 请求宽度的合法区间；超出的夹到边界，避免一张图被切成无数份
pub const MIN_WIDTH: u32 = 32;
pub const MAX_WIDTH: u32 = 1600;

/// 只认真正的图片魔数，不信任请求头
pub fn detect(body: &[u8]) -> Option<&'static str> {
    if body.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        return Some("image/png");
    }
    if body.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if body.len() > 12 && &body[0..4] == b"RIFF" && &body[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if body.starts_with(b"GIF87a") || body.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    None
}

pub fn kind_ok(kind: &str) -> bool {
    matches!(kind, "avatar" | "background" | "post")
}

pub struct StoredMedia {
    /// avatar / background / post —— 决定缩图要不要裁成正方形
    pub kind: String,
    pub mime: String,
    pub storage: String,
    pub object_key: String,
    pub bytes: Option<Vec<u8>>,
}

/// 存进 PostgreSQL（默认路径）
pub async fn save_local(
    pool: &PgPool,
    user_id: &str,
    kind: &str,
    mime: &str,
    body: &[u8],
) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('m');
    sqlx::query(
        "INSERT INTO user_media (id, user_id, kind, mime, bytes, size, storage, object_key)
         VALUES ($1,$2,$3,$4,$5,$6,'db','')",
    )
    .bind(&id)
    .bind(user_id)
    .bind(kind)
    .bind(mime)
    .bind(body)
    .bind(body.len() as i32)
    .execute(pool)
    .await?;
    Ok(id)
}

/// 只记对象键，字节已经在桶里
pub async fn save_object(
    pool: &PgPool,
    user_id: &str,
    kind: &str,
    mime: &str,
    object_key: &str,
    size: usize,
) -> Result<String, sqlx::Error> {
    let id = crate::ids::next('m');
    sqlx::query(
        "INSERT INTO user_media (id, user_id, kind, mime, bytes, size, storage, object_key)
         VALUES ($1,$2,$3,$4,NULL,$5,'s3',$6)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(kind)
    .bind(mime)
    .bind(size as i32)
    .bind(object_key)
    .execute(pool)
    .await?;
    Ok(id)
}

pub async fn load(pool: &PgPool, id: &str) -> Result<Option<StoredMedia>, sqlx::Error> {
    let row: Option<(String, String, String, String, Option<Vec<u8>>)> = sqlx::query_as(
        "SELECT kind, mime, storage, object_key, bytes FROM user_media WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(kind, mime, storage, object_key, bytes)| StoredMedia {
        kind,
        mime,
        storage,
        object_key,
        bytes,
    }))
}

/// 记录原图宽高（前端用来提前锁定图片框比例）
pub async fn set_dims(
    pool: &PgPool,
    id: &str,
    w: u32,
    h: u32,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE user_media SET width = $2, height = $3 WHERE id = $1")
        .bind(id)
        .bind(w as i32)
        .bind(h as i32)
        .execute(pool)
        .await?;
    Ok(())
}

/// 批量取尺寸。老图没记过宽高时，本地图读一次文件头并写回；S3 的跳过。
pub async fn sizes(
    pool: &PgPool,
    ids: &[String],
) -> Result<std::collections::HashMap<String, (u32, u32)>, sqlx::Error> {
    use std::collections::HashMap;

    let mut out: HashMap<String, (u32, u32)> = HashMap::new();
    if ids.is_empty() {
        return Ok(out);
    }

    let rows: Vec<(String, Option<i32>, Option<i32>, Option<Vec<u8>>, String)> = sqlx::query_as(
        "SELECT id, width, height, bytes, storage FROM user_media WHERE id = ANY($1)",
    )
    .bind(ids)
    .fetch_all(pool)
    .await?;

    for (id, w, h, bytes, storage) in rows {
        if let (Some(w), Some(h)) = (w, h) {
            out.insert(id, (w as u32, h as u32));
            continue;
        }
        if storage != "db" {
            continue;
        }
        let Some(body) = bytes else { continue };
        let Some((w, h)) = dimensions(&body) else {
            continue;
        };
        let _ = set_dims(pool, &id, w, h).await;
        out.insert(id, (w, h));
    }
    Ok(out)
}

/* ── 缩略图 ───────────────────────────────
   原图存 `user_media`，缩过的按 `(media_id, width)` 缓存在 `media_variants`：
   第一次请求算一次，之后直接读，浏览器端再长缓存一年。
   头像裁成正方形（UI 全是圆角方块），其它图保持比例。 */

#[derive(Debug, Clone)]
pub struct Variant {
    pub mime: String,
    pub bytes: Vec<u8>,
}

pub async fn load_variant(
    pool: &PgPool,
    media_id: &str,
    width: u32,
) -> Result<Option<Variant>, sqlx::Error> {
    let row: Option<(String, Vec<u8>)> = sqlx::query_as(
        "SELECT mime, bytes FROM media_variants WHERE media_id = $1 AND width = $2",
    )
    .bind(media_id)
    .bind(width as i32)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(mime, bytes)| Variant { mime, bytes }))
}

pub async fn save_variant(
    pool: &PgPool,
    media_id: &str,
    width: u32,
    mime: &str,
    bytes: &[u8],
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO media_variants (media_id, width, mime, bytes, size)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (media_id, width)
         DO UPDATE SET mime = $3, bytes = $4, size = $5",
    )
    .bind(media_id)
    .bind(width as i32)
    .bind(mime)
    .bind(bytes)
    .bind(bytes.len() as i32)
    .execute(pool)
    .await?;
    Ok(())
}

/// 只读文件头拿尺寸：解整张图很浪费，判断「原图是不是已经够小」用这个就够
pub fn dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()?
        .into_dimensions()
        .ok()
}

/// 生成缩图。返回 `None` 表示这张图缩不了（格式不认、或本来就比目标小），
/// 调用方应回落到原图，而不是报错。
pub fn make_variant(original: &[u8], width: u32, square: bool) -> Option<(String, Vec<u8>)> {
    let img = image::ImageReader::new(Cursor::new(original))
        .with_guessed_format()
        .ok()?
        .decode()
        .ok()?;

    let (ow, oh) = (img.width(), img.height());
    if ow == 0 || oh == 0 || ow <= width {
        return None;
    }

    let resized = if square {
        // 头像：居中裁正方形，避免非等比压扁
        img.resize_to_fill(width, width, image::imageops::FilterType::Triangle)
    } else {
        let nh = ((oh as u64 * width as u64) / ow as u64).max(1) as u32;
        img.resize_exact(width, nh, image::imageops::FilterType::Triangle)
    };

    // 有透明通道就留在 PNG（头像、图标常见），纯照片走 JPEG 小得多
    let (mime, out) = if resized.color().has_alpha() {
        let mut buf = Vec::new();
        // 默认压缩太松，256px 的头像能编出比原图还大的文件；用最高压缩 + 自适应滤波
        image::codecs::png::PngEncoder::new_with_quality(
            &mut buf,
            image::codecs::png::CompressionType::Best,
            image::codecs::png::FilterType::Adaptive,
        )
        .write_image(
            resized.as_bytes(),
            resized.width(),
            resized.height(),
            resized.color().into(),
        )
        .ok()?;
        ("image/png".to_string(), buf)
    } else {
        let rgb = resized.to_rgb8();
        let mut buf = Vec::new();
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 82);
        encoder.encode_image(&rgb).ok()?;
        ("image/jpeg".to_string(), buf)
    };

    // 缩完反而更大（原图本来就被压得很狠）就不值得换，交给调用方回原图
    if out.len() >= original.len() {
        return None;
    }
    Some((mime, out))
}

pub async fn delete_owned(st: &AppState, id: &str, user_id: &str) -> Result<bool, sqlx::Error> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT storage, object_key FROM user_media WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(user_id)
            .fetch_optional(&st.pool)
            .await?;
    let Some((storage, object_key)) = row else {
        return Ok(false);
    };

    if storage == "s3" && !object_key.is_empty() {
        if let Ok(Some((store, _, _))) = st.object_store.resolve(&st.pool, st.cfg.as_ref()).await {
            let _ = object_storage::delete(&store, &object_key).await;
        }
    }

    let done = sqlx::query("DELETE FROM user_media WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(&st.pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 后台文件管理：按用途与关键字列出图片
pub async fn admin_list(
    pool: &PgPool,
    q: &str,
    kind: &str,
    limit: i64,
) -> Result<Vec<(String, String, String, String, i64, String, DateTime<Utc>)>, sqlx::Error> {
    let like = format!("%{}%", q.trim());
    sqlx::query_as(
        "SELECT m.id, m.kind, u.nickname, m.mime, m.size::bigint, m.storage, m.created_at
           FROM user_media m
           LEFT JOIN users u ON u.id = m.user_id
          WHERE ($1 = '' OR m.kind = $1)
            AND ($2 = '%%' OR u.nickname ILIKE $2 OR m.id ILIKE $2)
          ORDER BY m.created_at DESC
          LIMIT $3",
    )
    .bind(kind)
    .bind(&like)
    .bind(limit.clamp(1, 200))
    .fetch_all(pool)
    .await
}

pub async fn total_bytes(pool: &PgPool) -> Result<(i64, i64), sqlx::Error> {
    let row: (i64, i64) = sqlx::query_as(
        "SELECT count(*)::bigint, COALESCE(sum(size), 0)::bigint FROM user_media",
    )
    .fetch_one(pool)
    .await?;
    Ok(row)
}

/// 管理员删图：连对象存储里的原件一起删
pub async fn admin_delete(st: &AppState, id: &str) -> Result<bool, sqlx::Error> {
    let row: Option<(String, String)> =
        sqlx::query_as("SELECT storage, object_key FROM user_media WHERE id = $1")
            .bind(id)
            .fetch_optional(&st.pool)
            .await?;
    let Some((storage, object_key)) = row else {
        return Ok(false);
    };

    if storage == "s3" && !object_key.is_empty() {
        if let Ok(Some((store, _, _))) = st.object_store.resolve(&st.pool, st.cfg.as_ref()).await {
            let _ = object_storage::delete(&store, &object_key).await;
        }
    }

    let done = sqlx::query("DELETE FROM user_media WHERE id = $1")
        .bind(id)
        .execute(&st.pool)
        .await?;
    Ok(done.rows_affected() > 0)
}

/// 只处理本站媒体地址 `/api/v1/media/{id}`；外部 URL 不碰
pub async fn delete_url(st: &AppState, user_id: &str, url: &str) -> Result<bool, sqlx::Error> {
    let Some(id) = url.strip_prefix("/api/v1/media/") else {
        return Ok(false);
    };
    if id.is_empty() || id.contains('/') {
        return Ok(false);
    }
    delete_owned(st, id, user_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 造一张「照片感」的图（伪随机噪声），渐变图 PNG 压得太好，
    /// 不适合用来验证「缩完是不是更小」
    fn sample_png(w: u32, h: u32) -> Vec<u8> {
        let mut seed: u32 = 0x9e37_79b9;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            (seed & 0xff) as u8
        };
        let img = image::RgbImage::from_fn(w, h, |_, _| image::Rgb([next(), next(), next()]));
        let mut buf = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(img)
            .write_to(&mut buf, image::ImageFormat::Png)
            .expect("编码测试图");
        buf.into_inner()
    }

    #[test]
    fn avatar_variant_is_square_and_much_smaller() {
        let src = sample_png(900, 700);
        let (mime, small) = make_variant(&src, 96, true).expect("应能生成缩图");
        assert_eq!(mime, "image/jpeg", "不透明图走 JPEG");
        assert!(
            small.len() < src.len() / 2,
            "缩图应更小：src={} small={}",
            src.len(),
            small.len()
        );
        assert_eq!(dimensions(&small), Some((96, 96)), "头像裁成正方形");
    }

    #[test]
    fn post_variant_keeps_ratio() {
        let src = sample_png(1200, 600);
        let (_, small) = make_variant(&src, 600, false).expect("应能生成缩图");
        assert_eq!(dimensions(&small), Some((600, 300)));
    }

    #[test]
    fn never_upscales() {
        let src = sample_png(200, 200);
        assert!(make_variant(&src, 256, true).is_none(), "比目标小就返回 None，交给调用方回落到原图");
    }

    #[test]
    fn detects_common_images() {
        assert_eq!(detect(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]), Some("image/png"));
        assert_eq!(detect(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(detect(b"not-an-image"), None);
        assert_eq!(detect(b"<svg></svg>"), None);
    }

    #[test]
    fn only_site_media_urls_are_deleted() {
        assert_eq!(id_of("/api/v1/media/m123"), Some("m123"));
        assert_eq!(id_of("https://evil.test/a.png"), None);
        assert_eq!(id_of("/api/v1/media/../x"), None);
    }

    fn id_of(url: &str) -> Option<&str> {
        let id = url.strip_prefix("/api/v1/media/")?;
        if id.is_empty() || id.contains('/') {
            return None;
        }
        Some(id)
    }
}
