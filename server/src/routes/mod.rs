pub mod about;
pub mod achievements;
pub mod admin;
pub mod agreements;
pub mod apps;
pub mod audit;
pub mod auth;
pub mod email_auth;
pub mod dev_teams;
pub mod dm;
pub mod groups;
pub mod health;
pub mod matches;
pub mod me;
pub mod notifications;
pub mod orgs;
pub mod points;
pub mod resource_files;
pub mod policies;
pub mod oauth;
pub mod posts;
pub mod public;
pub mod push;
pub mod resources;
pub mod rewards;
pub mod servers;
pub mod sponsors;
pub mod tasks;
pub mod titles;
pub mod tournaments;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::routing::{delete, get, patch, post};

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health::health))
        .route("/api/v1/auth/register", post(auth::register))
        .route("/api/v1/auth/login", post(auth::login))
        .route("/api/v1/auth/logout", post(auth::logout))
        .route("/api/v1/auth/email-code", post(email_auth::send_code))
        .route("/api/v1/auth/email-login", post(email_auth::login))
        .route("/api/v1/auth/state", get(auth::state))
        .route("/api/v1/me", patch(me::patch_me))
        .route("/api/v1/me/chrome", get(me::chrome))
        .route(
            "/api/v1/me/title-requests",
            get(titles::mine).post(titles::create),
        )
        .route(
            "/api/v1/me/title-requests/{id}",
            axum::routing::delete(titles::cancel),
        )
        .route(
            "/api/v1/me/resource-file",
            post(resource_files::upload)
                .layer(DefaultBodyLimit::max(crate::resource_files::MAX_BYTES + 1024 * 1024)),
        )
        .route("/api/v1/resource-files/{id}", get(resource_files::download))
        .route(
            "/api/v1/me/media",
            post(me::upload_media).layer(DefaultBodyLimit::max(crate::media::MAX_BYTES + 1024 * 1024)),
        )
        .route("/api/v1/media/{id}", get(me::media_file))
        .route("/api/v1/auth/oauth/{provider}", get(oauth::start))
        .route(
            "/api/v1/auth/oauth/{provider}/callback",
            get(oauth::callback),
        )
        .route("/api/v1/posts", get(posts::list).post(posts::create))
        .route("/api/v1/posts/{id}", get(public::post))
        .route("/api/v1/posts/{id}/comments", post(posts::comment))
        .route("/api/v1/posts/{id}/like", post(posts::like))
        .route("/api/v1/settings", get(public::settings))
        .route("/api/v1/announcements", get(public::announcements))
        .route("/api/v1/announcements/{id}", get(public::announcement))
        .route("/api/v1/users", get(public::users))
        .route("/api/v1/users/{id}", get(public::user))
        .route("/api/v1/stats", get(public::stats))
        .route("/api/v1/about", get(about::public))
        .route(
            "/api/v1/admin/about",
            get(about::admin_list).post(about::admin_create),
        )
        .route(
            "/api/v1/admin/about/{id}",
            patch(about::admin_patch).delete(about::admin_remove),
        )
        .route("/api/v1/slides", get(public::slides))
        .route("/api/v1/sponsors", get(sponsors::list))
        .route("/api/v1/achievements", get(achievements::map))
        .route("/api/v1/achievements/{userId}", get(achievements::one))
        .route("/api/v1/agreements", get(agreements::list))
        .route("/api/v1/agreements/signatures", get(agreements::signatures))
        .route("/api/v1/agreements/sign", post(agreements::sign))
        .route("/api/v1/app/latest", get(apps::latest))
        .route("/api/v1/matches", get(matches::list).post(matches::create))
        .route("/api/v1/matches/{id}", get(matches::get))
        .route("/api/v1/matches/{id}/accept", post(matches::accept))
        .route("/api/v1/policies", get(policies::list))
        .route("/api/v1/policies/{slug}", get(policies::get))
        .route("/api/v1/push/key", get(push::key))
        .route("/api/v1/push/subscribe", post(push::subscribe))
        .route("/api/v1/push/unsubscribe", post(push::unsubscribe))
        .route("/api/v1/admin/push", get(push::overview))
        .route("/api/v1/admin/push/send", post(push::send))
        .route("/api/v1/admin/push/subscriptions", delete(push::prune))
        .route("/api/v1/dm", get(dm::list))
        .route("/api/v1/dm/unread", get(dm::unread))
        .route("/api/v1/dm/{peerId}", get(dm::thread).post(dm::send))
        .route("/api/v1/dm/{peerId}/read", post(dm::read))
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
            "/api/v1/admin/posts/{id}/floors",
            get(admin::post_floors),
        )
        .route(
            "/api/v1/admin/comments/{id}",
            axum::routing::delete(admin::delete_comment),
        )
        .route(
            "/api/v1/admin/points",
            get(admin::list_points).post(admin::adjust_points),
        )
        .route(
            "/api/v1/admin/points/{id}/logs",
            get(admin::point_logs),
        )
        .route("/api/v1/admin/title-requests", get(titles::admin_list))
        .route(
            "/api/v1/admin/title-requests/{id}",
            patch(titles::admin_review),
        )
        .route("/api/v1/admin/badge-styles", get(titles::badge_styles))
        .route(
            "/api/v1/admin/badge-styles/{id}",
            patch(titles::badge_style_set),
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
        .route(
            "/api/v1/guilds",
            get(orgs::list_guilds).post(orgs::create_guild),
        )
        .route(
            "/api/v1/guilds/{id}",
            get(orgs::guild).patch(orgs::patch_guild).delete(orgs::delete_guild),
        )
        .route(
            "/api/v1/teams",
            get(orgs::list_teams).post(orgs::create_team),
        )
        .route(
            "/api/v1/teams/{id}",
            get(orgs::team).patch(orgs::patch_team).delete(orgs::delete_team),
        )
        .route("/api/v1/leaderboard", get(orgs::leaderboard))
        .route(
            "/api/v1/leaderboard/developers",
            get(resources::developer_board),
        )
        .route(
            "/api/v1/resources",
            get(resources::list).post(resources::create),
        )
        .route(
            "/api/v1/resources/{id}",
            get(resources::detail)
                .patch(resources::patch)
                .delete(resources::remove),
        )
        .route("/api/v1/resources/{id}/like", post(resources::like))
        .route("/api/v1/resources/{id}/download", post(resources::download))
        .route(
            "/api/v1/resources/{id}/files/{fileId}/download",
            post(resources::download_attachment),
        )
        .route(
            "/api/v1/dev-teams",
            get(dev_teams::list).post(dev_teams::create),
        )
        .route(
            "/api/v1/dev-teams/{id}",
            get(dev_teams::detail)
                .patch(dev_teams::patch)
                .delete(dev_teams::remove),
        )
        .route(
            "/api/v1/dev-teams/{id}/members",
            post(dev_teams::add_member),
        )
        .route(
            "/api/v1/dev-teams/{id}/members/{userId}",
            delete(dev_teams::remove_member),
        )
        .route(
            "/api/v1/dev-teams/{id}/resources",
            get(dev_teams::team_resources),
        )
        .route("/api/v1/me/dev-teams", get(dev_teams::mine))
        .route("/api/v1/rewards", get(rewards::snapshot))
        .route("/api/v1/rewards/redeem", post(rewards::redeem))
        .route("/api/v1/rewards/lottery", post(rewards::draw))
        .route(
            "/api/v1/rewards/cards/{id}/open",
            post(rewards::open),
        )
        .route("/api/v1/points", get(points::snapshot))
        .route("/api/v1/points/checkin", post(points::checkin))
        .route("/api/v1/points/rank", get(points::rank))
        .route("/api/v1/groups", get(groups::public_list))
        .route(
            "/api/v1/servers",
            get(servers::list).post(servers::create),
        )
        .route(
            "/api/v1/servers/{id}",
            patch(servers::patch).delete(servers::remove),
        )
        .route("/api/v1/servers/{id}/probe", post(servers::refresh))
        .route("/api/v1/tasks", get(tasks::list))
        .route("/api/v1/tasks/{id}/claim", post(tasks::claim))
        .route(
            "/api/v1/admin/tasks",
            get(tasks::admin_list).post(tasks::admin_create),
        )
        .route(
            "/api/v1/admin/tasks/{id}",
            patch(tasks::admin_patch).delete(tasks::admin_delete),
        )
        .route("/api/v1/tournaments", get(tournaments::list))
        .route("/api/v1/tournaments/{id}", get(tournaments::detail))
        .route(
            "/api/v1/tournaments/{id}/signup",
            post(tournaments::signup).delete(tournaments::cancel),
        )
        .route(
            "/api/v1/admin/tournaments",
            get(tournaments::admin_list).post(tournaments::admin_create),
        )
        .route(
            "/api/v1/admin/tournaments/{id}",
            patch(tournaments::admin_patch).delete(tournaments::admin_delete),
        )
        .route(
            "/api/v1/admin/tournaments/{id}/entries",
            get(tournaments::admin_entries),
        )
        .route(
            "/api/v1/admin/tournaments/entries/{entryId}",
            patch(tournaments::admin_review),
        )
        .route("/api/v1/me/servers", get(servers::mine))
        .route("/api/v1/relay/rooms", get(servers::rooms))
        .route("/api/v1/admin/users/{id}/developer", patch(admin::set_developer))
        .route("/api/v1/admin/resources", get(resources::admin_list))
        .route(
            "/api/v1/admin/resources/{id}",
            patch(resources::admin_patch).delete(resources::admin_delete),
        )
        .route("/api/v1/admin/dev-teams", get(dev_teams::admin_list))
        .route(
            "/api/v1/admin/dev-teams/{id}",
            delete(dev_teams::admin_delete),
        )
        .route(
            "/api/v1/admin/rewards/cards",
            get(rewards::admin_cards).post(rewards::admin_create_card),
        )
        .route(
            "/api/v1/admin/rewards/cards/{id}",
            delete(rewards::admin_delete_card),
        )
        .route(
            "/api/v1/admin/rewards/prizes",
            get(rewards::admin_prizes).post(rewards::admin_create_prize),
        )
        .route(
            "/api/v1/admin/rewards/prizes/{id}",
            patch(rewards::admin_patch_prize).delete(rewards::admin_delete_prize),
        )
        .route("/api/v1/admin/orgs", get(orgs::admin_list))
        .route(
            "/api/v1/admin/orgs/{kind}/{id}",
            patch(orgs::admin_patch).delete(orgs::admin_delete),
        )
        .route("/api/v1/admin/servers", get(servers::admin_list))
        .route(
            "/api/v1/admin/servers/probe",
            get(servers::admin_probe),
        )
        .route(
            "/api/v1/admin/servers/{id}",
            patch(servers::admin_patch).delete(servers::admin_delete),
        )
        .route("/api/v1/admin/audit/posts", get(audit::pending))
        .route("/api/v1/admin/audit/posts/{id}", post(audit::review))
        .route("/api/v1/admin/audit/test", post(audit::test))
        .route(
            "/api/v1/admin/groups",
            get(groups::list).post(groups::create),
        )
        .route(
            "/api/v1/admin/groups/{id}",
            patch(groups::patch).delete(groups::remove),
        )
        .route("/api/v1/admin/users/{id}/group", patch(groups::assign))
        .route("/api/v1/admin/afdian/sync", post(admin::sync_afdian))
        .route("/api/v1/admin/storage/test", post(admin::storage_test))
        .route(
            "/api/v1/admin/users/{id}/badges",
            patch(admin::patch_user_badges),
        )
        .with_state(state)
}
