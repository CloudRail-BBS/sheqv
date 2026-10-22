pub mod agreements;
pub mod auth;
pub mod health;
pub mod me;
pub mod notifications;
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
        .route("/api/v1/posts", get(posts::list).post(posts::create))
        .route("/api/v1/posts/{id}/comments", post(posts::comment))
        .route("/api/v1/posts/{id}/like", post(posts::like))
        .route("/api/v1/agreements", get(agreements::list))
        .route("/api/v1/agreements/signatures", get(agreements::signatures))
        .route("/api/v1/agreements/sign", post(agreements::sign))
        .route("/api/v1/notifications", get(notifications::list))
        .route("/api/v1/notifications/read", post(notifications::read))
        .with_state(state)
}
