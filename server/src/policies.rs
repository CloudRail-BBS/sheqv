//! 站内政策：用户协议、免责声明、隐私政策等。
//!
//! 与「公约」分开：公约强调签署与行为门槛；政策是随时可查阅的声明文本。
//! `show_on_cert=true` 的政策会作为证书底部的免责声明来源（默认 disclaimer）。

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    pub slug: String,
    pub title: String,
    pub summary: String,
    pub body: String,
    pub version: String,
    pub published: bool,
    pub show_on_cert: bool,
    pub builtin: bool,
    pub updated_at: String,
}

#[derive(sqlx::FromRow)]
struct Row {
    slug: String,
    title: String,
    summary: String,
    body: String,
    version: String,
    published: bool,
    show_on_cert: bool,
    builtin: bool,
    updated_at: DateTime<Utc>,
}

impl Row {
    fn into_view(self) -> Policy {
        Policy {
            slug: self.slug,
            title: self.title,
            summary: self.summary,
            body: self.body,
            version: self.version,
            published: self.published,
            show_on_cert: self.show_on_cert,
            builtin: self.builtin,
            updated_at: self.updated_at.format("%Y-%m-%d").to_string(),
        }
    }
}

const COLS: &str =
    "slug, title, summary, body, version, published, show_on_cert, builtin, updated_at";

pub async fn ensure_builtin(pool: &PgPool) -> Result<(), sqlx::Error> {
    let builtin = [
        (
            "terms",
            "用户协议",
            "使用本站服务前，请阅读并理解本协议。注册、登录或使用任一功能即视为同意。",
            r#"## 一、关于本协议

本协议是你与云轨社区（下称「本站」，域名为 crbbsx.com，含网页端、桌面客户端与安卓客户端）之间关于使用本站服务的约定。

注册、登录、签署《社区公约》或实际使用任一功能，即表示你已阅读并同意本协议。若你不同意，请停止使用。

本协议与《隐私政策》《免责声明》《社区公约》共同构成完整约定；涉及个人信息处理的，以《隐私政策》为准。

若你未满 18 周岁，请在监护人指导下阅读并决定是否使用。

## 二、服务内容

本站是玩家自建的 Minecraft 社区与赛事记录平台，主要提供：

- 论坛、公告与私信；
- 公会、战队与约战流程（名单快照、双方提交、确认与争议仲裁）；
- 赛事报名、赛程与成绩记录；
- 联机大厅的服务器信息展示；
- 资源库、开发团队与作品发布；
- 积分、任务、签到与福利抽奖；
- 桌面与移动客户端。

本站不是游戏运营方，与 Mojang Studios、Microsoft 及任何游戏代理商均无隶属或合作关系。

## 三、账号

- 你需要一个账号才能使用大部分功能。注册时应提供真实、可用的信息，不得冒用他人身份。
- 一人一号。禁止批量注册、买卖、出租、出借账号，或与他人共用账号参与约战与赛事。
- 密码由你自行保管。本站以 scrypt 加盐哈希存储密码，任何管理员都不会向你索要明文密码。
- 使用 GitHub、CNKD 等第三方登录时，你还需遵守对应平台的条款；本站仅获取登录所需的标识信息。
- 账号被盗或出现异常，请立即联系管理员。因你保管不当造成的损失由你自行承担。
- 你可以申请注销账号；注销后的数据处理方式见《隐私政策》。

## 四、你发布的内容

- 你对自己发布的帖子、评论、图片、资源文件等保留著作权。
- 为向你提供服务，你授予本站非独占、免费、可在服务范围内转授权的许可，用于存储、展示、生成缩略图、推送摘要与备份。该许可在你删除内容或注销账号后终止（已分发的缓存与备份除外）。
- 你应保证对上传内容拥有权利，转载、搬运、二次创作需获得授权并注明来源。
### 禁止发布以下内容

- 违反法律法规、危害国家安全与社会公共利益的；
- 色情、暴力、赌博、诈骗、传销、洗钱相关的；
- 外挂、作弊工具、破解补丁、盗版游戏与账号交易的；
- 侵犯他人著作权、商标权、肖像权、隐私权的；
- 人肉搜索、开盒、泄露他人真实信息的；
- 恶意刷屏、广告引流、诱导私下交易的；
- 冒充本站官方、管理员或他人身份的；
- 其他违反《社区公约》的内容。
- 对违规内容，本站可以删除、隐藏、限制展示，并视情节限制账号功能直至封禁。涉嫌违法犯罪的，将依法向主管机关报告并配合调查。
- 如果你认为处置有误，可在 7 日内通过站内私信或「关于社区」页公布的联系方式申诉，我们会在合理期限内答复。

## 五、社区秩序

- 发帖与评论前需签署《社区公约》；公约与本章共同约束站内行为。
- 请尊重其他玩家：禁止人身攻击、歧视性言论、恶意引战、骚扰与跟踪。
- 版务处置以站内操作记录为准；对处理结果有异议，按上一条申诉。

## 六、约战与赛事

- 约战流程为：发起约战 → 锁定名单快照 → 双方提交结果 → 确认或提出争议 → 管理员仲裁。
- 名单快照记录的是提交时点的账号与内容，用于还原过程，不构成对比赛结果的官方认证。
- 你提交的材料应真实、完整。伪造截图、代打、使用作弊客户端或恶意拖延的，本站可判定负场、取消成绩、清空积分，直至封禁。
- 除明确标注「官方赛事」外，赛事由主办方自负其责；本站提供报名、记录与展示工具。
- 报名信息中的游戏 ID、联系方式会向赛事主办方展示，报名即视为同意。

## 七、积分与福利

- 积分是站内虚拟数值，不具有现金价值，不可提现、转让或买卖。
- 积分可通过签到、发帖、评论、任务与活动获得；通过脚本、刷量等异常方式获取的，本站有权回收并处罚。
- 抽奖的概率、奖品与发放方式以活动页面说明为准；实物奖品需你提供收货信息，仅用于寄送。
- 礼品卡、兑换码遗失不补，禁止倒卖。

## 八、开发者与资源

- 发布首个资源后会自动获得开发者身份；开发团队另行遵守团队页面的规则（一人一队、成员须为开发者）。
- 上传的资源文件应无病毒、无后门，且你有权分发；请附上许可协议与来源说明。
- 本站对资源提供存储与分发，不做逐份安全审计。接到权利人通知并核实后，会下架相关内容。
- 下载与使用资源的风险由你承担，建议自行校验文件哈希。

## 九、付费与赞助

- 本站目前以免费服务为主。如开放赞助（例如爱发电），属自愿赠与，用于服务器与开发成本；除法律另有规定或页面明确说明外，不予退款。
- 未经本站书面同意，任何人不得以本站名义募资、招生、售卖商品或服务。

## 十、知识产权

- 站名、Logo、界面设计、前后端代码归本站或相应权利人所有。未经许可，不得抓取、镜像、批量转载或用于商业用途。
- 社区内容的版权归发布者所有；转载需取得授权。
- Minecraft 及相关商标归其权利人所有，本站仅在社区讨论的意义上使用。

## 十一、服务变更与终止

- 本站可能因维护、升级、安全事件或不可抗力暂停或调整服务，会尽量提前公告。
- 你严重违反本协议或公约的，本站可以限制或终止你的账号使用。
- 服务终止后，你的数据按《隐私政策》处理。

## 十二、责任限制

- 本站按「现状」提供服务，不对第三方行为、用户之间的纠纷、比赛结果作出担保。
- 具体免责事项见《免责声明》。本条不排除法律强制规定不得排除的责任。

## 十三、协议更新

- 本协议更新后会在「政策与协议」页公布，并标注版本与更新日期。
- 重大变更会通过公告或站内信提示。继续使用服务视为接受更新后的协议；不接受的，请停止使用并申请注销。

## 十四、法律适用与争议解决

- 本协议适用中华人民共和国法律（不含香港特别行政区、澳门特别行政区与台湾地区法律）。
- 争议应先友好协商；协商不成的，提交本站运营方所在地有管辖权的人民法院处理。

## 十五、联系我们

- 站内私信管理员账号，或在「关于社区」页查看公开的联系方式。
- 涉及侵权、违法内容的举报，请附上具体链接与说明，我们会尽快核实处理。"#,
        ),
        (
            "privacy",
            "隐私政策",
            "说明我们收集哪些信息、如何使用与保存，以及你可以如何管理自己的数据。",
            r#"## 一、适用范围

本政策说明云轨社区（crbbsx.com，含网页端、桌面客户端与安卓客户端）收集哪些信息、如何使用与保存，以及你可以如何管理这些信息。

## 二、我们收集的信息

- 账号信息：用户名、昵称、邮箱（如填写）、密码哈希、第三方登录标识（GitHub 数字 ID、CNKD 的 sub）、注册时间、站内 UID。
- 资料信息：头像、主页背景、个人签名、头衔与 UID 外观、身份组。
- 你发布的内容：帖子、评论、图片、资源与附件、私信、公会与战队信息、约战与赛事提交（含名单快照、截图）、举报与申诉记录。
- 行为数据：点赞、收藏、签到、积分流水、任务领取与抽奖记录。
- 设备与日志：IP 地址、浏览器标识（User-Agent）、请求时间与路径、错误日志。
- 推送信息：只有在你主动开启浏览器推送后，才会保存订阅端点与加密密钥。
- 本地存储：登录会话、主题偏好、页签状态、未发送的草稿。

我们不会收集你的通讯录、短信、精确位置或相册（你主动选择上传的图片除外）。

## 三、收集的目的

- 提供与维护服务：登录、发帖、约战、赛事、积分与推送通知。
- 安全与风控：登录限流、私信频率限制、人机验证、异常行为识别。
- 通知：回复、私信、审核结果、公告与活动提醒。
- 改进产品：以聚合方式统计功能使用情况，不针对个人画像。
- 履行法律义务：配合主管机关依法提出的要求。

## 四、Cookie 与本地存储

- 必要 Cookie：ba_session 用于保存登录状态，设置为 HttpOnly，脚本无法读取。禁用后无法保持登录。
- 本地存储：主题、页签、草稿等偏好，仅保存在你的浏览器中，清除浏览器数据即可删除。
- 本站不使用广告 Cookie，不接入第三方广告或行为追踪 SDK。

## 五、第三方服务

为实现部分功能，我们会与下列第三方发生必要的数据交互：

- GitHub OAuth：用于第三方登录，传递授权码并获取公开资料与邮箱（如你授权）。
- CNKD：用于第三方登录，获取唯一标识与昵称。
- GeeTest 极验：用于人机验证，会获取验证票据及设备特征，具体见其隐私政策。
- 邮件服务商：用于发送验证码与通知，需传递你的邮箱地址。
- 对象存储与缓存（如启用）：用于保存图片、资源文件与会话计数。
- 浏览器推送网关：用于送达推送消息，内容经过加密。

除上述必要场景、你的明确同意或法律要求外，我们不会出售、出租或向第三方提供你的个人信息。

## 六、存储地点与期限

- 本站为自托管服务，数据主要存储在境内服务器；备份可能位于其他机房。
- 账号信息在账号存续期间保存；访问日志默认保存 90 天；删除的内容会从在线库移除，备份中的副本最长保留 30 天。
- 注销账号后，账号信息将被删除或去标识化；你发布的内容可选择一并删除，或匿名化后保留（用于维持帖子连贯性）。
- 法律法规要求更长保存期限的，从其规定。

## 七、安全措施

- 密码使用 scrypt 加盐哈希，不可逆；会话 Cookie 使用 HMAC 签名。
- 权限判定全部在服务端完成，前端只负责展示。
- 登录、私信等敏感操作有频率限制，必要时触发人机验证。
- 但互联网没有绝对安全。请使用强密码、不要与其他网站复用，并定期检查登录设备。

## 八、你的权利

- 查阅与更正：在「我的」页面随时修改资料。
- 导出：可联系管理员申请导出你的账号与内容数据，我们会在核实身份后提供常用格式的文件。
- 删除：可删除自己发布的内容，或申请注销账号。
- 撤回同意：关闭推送、解除第三方登录绑定。
- 我们会在收到请求后 15 个工作日内答复。

## 九、未成年人

- 不满 14 周岁的用户不应注册；如确需使用，应由监护人同意并陪同。
- 14 至 18 周岁的用户，建议在监护人指导下使用，并避免在公开内容中透露真实姓名、学校、住址等信息。
- 监护人发现未成年人信息被不当收集的，可联系管理员要求删除。

## 十、信息跨境

本站原则上不向境外传输个人信息。使用 GitHub 等境外服务登录时，认证过程会与该服务商直接交互，适用其隐私政策。

## 十一、政策更新

本政策更新后会在「政策与协议」页公布并标注版本；涉及权利实质变化的，会通过公告或站内信提示。

## 十二、联系我们

对本政策有疑问，或需要行使上述权利，请站内私信管理员，或在「关于社区」页查看公开联系方式。"#,
        ),
        (
            "disclaimer",
            "免责声明",
            "本站为非官方玩家社区，仅提供信息与记录工具，不对比赛结果、第三方行为与下载内容作担保。",
            r#"## 一、非官方声明

本站是玩家自建的非官方社区，与 Mojang Studios、Microsoft 及任何游戏代理商均无隶属、代理或合作关系。「Minecraft」等名称与商标归其权利人所有。

## 二、信息仅供参考

- 联机大厅中的服务器地址、版本、在线人数与状态由定时探测或用户提交生成，可能延迟、失效或被篡改，不构成推荐或安全担保。
- 等级、信誉分、榜单与徽章基于站内行为计算，仅反映站内表现，不代表对现实中技术、品行或资质的评价。

## 三、约战与赛事

- 本站提供流程工具与记录能力，不是赛事主办方、裁判机构或担保方。
- 名单快照只能证明「某账号在某一时刻提交了这些内容」，不能证明内容真实，也不能证明比赛实际结果。
- 争议仲裁是站内处理结果，不构成法律裁决；你不服时仍可依法寻求其他救济。
- 除明确标注「官方赛事」外，赛事由主办方自负其责；线下比赛、第三方平台比赛与本站无关。

## 四、用户之间的互动与交易

- 交易、借号、代练、组队、赠予等行为由当事人自行负责，本站不参与、不担保。
- 请勿通过站外转账、私下红包等方式交易虚拟物品；遇到诈骗请保留证据并报警，同时在站内举报。
- 任何人不得以本站名义募资、招生或售卖商品。

## 五、资源与下载

- 资源由用户上传，本站未逐份进行安全审计。下载前请自行查毒、核对许可协议与来源。
- 因使用第三方资源导致的设备损坏、存档丢失、账号被封等后果，由使用者自行承担。
- 权利人认为内容侵权的，可通过「关于社区」页的联系方式提交权属证明，我们核实后会下架。

## 六、第三方链接与服务

本站可能包含指向站外（如视频、网盘、赞助平台）的链接。第三方内容由其运营者负责，本站不对其准确性、安全性与可用性作保证；点击跳转即离开本站控制范围。

## 七、证书与存证

站内证书（公约签署凭证、赛事名单凭证等）是社区内部凭证，用于成员之间互认，不具有公证或司法鉴定效力。如需用于司法程序，请自行申请公证或第三方电子存证服务。

## 八、服务可用性与数据

- 服务按「现状」提供，可能因维护、升级、攻击、网络故障或不可抗力中断。
- 请自行保存重要内容（作品源文件、赛事截图、聊天记录）。对因上述原因导致的数据延迟、丢失或泄露，本站不承担赔偿责任，法律强制规定的除外。

## 九、责任限制

- 在法律允许的范围内，本站不对间接损失、附带损失、预期利益损失或惩罚性赔偿承担责任。
- 就本服务产生的直接责任，累计不超过你过去 12 个月内实际向本站支付的费用；免费服务的上限为零。
- 本条不排除故意或重大过失责任，也不排除法律明确规定不得排除的责任。

## 十、举报与联系

- 违规内容可通过帖子与评论上的举报入口，或站内私信管理员反馈；我们会在合理期限内处理。
- 涉及人身安全、诈骗、未成年人风险的紧急情况，请先报警，再通知本站配合处理。"#,
        ),
    ];

    for (slug, title, summary, body) in builtin {
        sqlx::query(
            "INSERT INTO policies (slug, title, summary, body, version, published, show_on_cert, builtin)
             VALUES ($1,$2,$3,$4,'v2',true,$5,true)
             ON CONFLICT (slug) DO NOTHING",
        )
        .bind(slug)
        .bind(title)
        .bind(summary)
        .bind(body)
        .bind(slug == "disclaimer")
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub async fn list(pool: &PgPool, published_only: bool) -> Result<Vec<Policy>, sqlx::Error> {
    let sql = if published_only {
        // 三份内置政策同时写入，updated_at 相同；用固定顺序兜底，
        // 让列表按「用户协议 → 隐私政策 → 免责声明」呈现，而不是 slug 字母序
        format!(
            "SELECT {COLS} FROM policies WHERE published
             ORDER BY updated_at DESC,
                      CASE slug WHEN 'terms' THEN 0 WHEN 'privacy' THEN 1
                                WHEN 'disclaimer' THEN 2 ELSE 3 END,
                      slug"
        )
    } else {
        format!("SELECT {COLS} FROM policies ORDER BY builtin DESC, updated_at DESC, slug")
    };
    let rows: Vec<Row> = sqlx::query_as(&sql).fetch_all(pool).await?;
    Ok(rows.into_iter().map(Row::into_view).collect())
}

pub async fn get(pool: &PgPool, slug: &str, published_only: bool) -> Result<Option<Policy>, sqlx::Error> {
    let sql = if published_only {
        format!("SELECT {COLS} FROM policies WHERE slug = $1 AND published")
    } else {
        format!("SELECT {COLS} FROM policies WHERE slug = $1")
    };
    let row: Option<Row> = sqlx::query_as(&sql).bind(slug).fetch_optional(pool).await?;
    Ok(row.map(Row::into_view))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPolicy {
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub body: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default = "default_true")]
    pub published: bool,
    #[serde(default)]
    pub show_on_cert: bool,
}

fn default_version() -> String {
    "v1".into()
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPolicy {
    pub title: Option<String>,
    pub summary: Option<String>,
    pub body: Option<String>,
    pub version: Option<String>,
    pub published: Option<bool>,
    pub show_on_cert: Option<bool>,
}

pub fn valid_slug(slug: &str) -> bool {
    (2..=40).contains(&slug.len())
        && slug
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn validate(title: &str, slug: &str) -> Option<&'static str> {
    if !valid_slug(slug) {
        return Some("标识只能使用 2–40 位小写字母、数字或短横线");
    }
    let title_len = title.trim().chars().count();
    if !(2..=60).contains(&title_len) {
        return Some("标题需为 2–60 字");
    }
    None
}

pub async fn create(pool: &PgPool, input: &NewPolicy) -> Result<Option<Policy>, sqlx::Error> {
    let hit: Option<String> = sqlx::query_scalar("SELECT slug FROM policies WHERE slug = $1")
        .bind(&input.slug)
        .fetch_optional(pool)
        .await?;
    if hit.is_some() {
        return Ok(None);
    }
    sqlx::query(
        "INSERT INTO policies (slug, title, summary, body, version, published, show_on_cert)
         VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(&input.slug)
    .bind(input.title.trim())
    .bind(input.summary.trim())
    .bind(&input.body)
    .bind(input.version.trim())
    .bind(input.published)
    .bind(input.show_on_cert)
    .execute(pool)
    .await?;
    get(pool, &input.slug, false).await
}

pub async fn update(
    pool: &PgPool,
    slug: &str,
    patch: &PatchPolicy,
) -> Result<Option<Policy>, sqlx::Error> {
    let Some(mut current) = get(pool, slug, false).await? else {
        return Ok(None);
    };
    if let Some(v) = &patch.title {
        current.title = v.trim().to_string();
    }
    if let Some(v) = &patch.summary {
        current.summary = v.trim().to_string();
    }
    if let Some(v) = &patch.body {
        current.body = v.clone();
    }
    if let Some(v) = &patch.version {
        current.version = v.trim().to_string();
    }
    if let Some(v) = patch.published {
        current.published = v;
    }
    if let Some(v) = patch.show_on_cert {
        current.show_on_cert = v;
    }

    sqlx::query(
        "UPDATE policies SET title=$2, summary=$3, body=$4, version=$5, published=$6,
                show_on_cert=$7, updated_at=now() WHERE slug=$1",
    )
    .bind(slug)
    .bind(&current.title)
    .bind(&current.summary)
    .bind(&current.body)
    .bind(&current.version)
    .bind(current.published)
    .bind(current.show_on_cert)
    .execute(pool)
    .await?;
    get(pool, slug, false).await
}

pub async fn remove(pool: &PgPool, slug: &str) -> Result<bool, sqlx::Error> {
    let done = sqlx::query("DELETE FROM policies WHERE slug = $1 AND builtin = false")
        .bind(slug)
        .execute(pool)
        .await?;
    Ok(done.rows_affected() > 0)
}
