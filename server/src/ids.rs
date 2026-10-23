//! 业务 id 生成：`前缀 + base36 毫秒 + 4 位随机 base36`。
//!
//! 只用毫秒会在「同一毫秒两个请求」时撞主键（公约/公告/轮播/赞助都是后台连点就会发生），
//! 所以统一加 4 位随机尾巴。长度不固定，与 Node 版的历史 id 同构。

use chrono::Utc;
use rand::RngCore;

const ALPHABET: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

pub fn next(prefix: char) -> String {
    let mut n = Utc::now().timestamp_millis().max(0) as u64;
    let mut ts = Vec::new();
    if n == 0 {
        ts.push(b'0');
    }
    while n > 0 {
        ts.push(ALPHABET[(n % 36) as usize]);
        n /= 36;
    }
    ts.reverse();

    let mut rnd = [0u8; 4];
    rand::rng().fill_bytes(&mut rnd);

    let mut out = String::with_capacity(1 + ts.len() + rnd.len());
    out.push(prefix);
    for b in ts {
        out.push(b as char);
    }
    for b in rnd {
        out.push(ALPHABET[(b % 36) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_and_shape() {
        let id = next('p');
        assert!(id.starts_with('p'));
        assert!(id.len() >= 6);
        assert!(id.chars().all(|c| c.is_ascii_alphanumeric()));
    }

    #[test]
    fn no_collision_in_same_millisecond() {
        let ids: std::collections::HashSet<_> = (0..200).map(|_| next('c')).collect();
        assert_eq!(ids.len(), 200);
    }
}
