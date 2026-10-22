pub mod admin;
pub mod agreements;
pub mod auth;
pub mod health;
pub mod me;
pub mod notifications;
pub mod oauth;
pub mod posts;

use axum::Router;
use axum::routing::{get, patch, post};

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health::health))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/auth/state", get(auth::state))
        .route("/api/v1/me", patch(me::patch_me))
        .route("/api/v1/auth/oauth/{provider}", get(oauth::start))
        .route(
            "/api/v1/auth/oauth/{provider}/callback",
            get(oauth::callback),
        )
        .route("/api/v1/posts", get(posts::list).post(posts::create))
        .route("/api/v1/posts/{id}/comments", post(posts::comment))
        .route("/api/v1/posts/{id}/like", post(posts::like))
        .route("/api/v1/agreements", get(agreements::list))
        .route("/api/v1/agreements/signatures", get(agreements::signatures))
        .route("/api/v1/agreements/sign", post(agreements::sign))
        .route("/api/v1/notifications", get(notifications::list))
        .route("/api/v1/notifications/read", post(notifications::read))
        .route(
            "/api/v1/admin/users",
            get(admin::list_users)
                .patch(admin::patch_user)
                .delete(admin::delete_user),
        )
        .route(
            "/api/v1/admin/posts",
            get(admin::list_posts).delete(admin::delete_post),
        )
        .route(
            "/api/v1/admin/settings",
            get(admin::get_settings).patch(admin::patch_settings),
        )
        .route(
            "/api/v1/admin/agreements",
            get(admin::list_agreements)
                .post(admin::create_agreement)
                .patch(admin::patch_agreement)
                .delete(admin::delete_agreement),
        )
        .route(
            "/api/v1/admin/announcements",
            get(admin::list_announcements)
                .post(admin::create_announcement)
                .patch(admin::patch_announcement)
                .delete(admin::delete_announcement),
        )
        .route(
            "/api/v1/admin/slides",
            get(admin::list_slides)
                .post(admin::create_slide)
                .patch(admin::patch_slide)
                .delete(admin::delete_slide),
        )
        .route(
            "/api/v1/admin/sponsors",
            get(admin::get_sponsors)
                .post(admin::create_sponsor)
                .patch(admin::patch_sponsor)
                .delete(admin::delete_sponsor),
        )
        .route("/api/v1/admin/afdian/sync", post(admin::sync_afdian))
        .with_state(state)
}
