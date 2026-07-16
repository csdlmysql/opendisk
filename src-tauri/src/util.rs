//! Small helpers: wall-clock time formatting (no external date crate) and slugs.

use std::time::{SystemTime, UNIX_EPOCH};

/// Current time in unix milliseconds (0 if the clock is before the epoch).
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Current time in unix seconds.
pub fn now_secs() -> u64 {
    now_ms() / 1000
}

/// Convert unix seconds (UTC) to (year, month, day, hour, minute, second).
/// Uses Howard Hinnant's civil-from-days algorithm; no external crate.
pub fn ymd_hms(secs: u64) -> (i64, u32, u32, u32, u32, u32) {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let hour = (rem / 3600) as u32;
    let minute = ((rem % 3600) / 60) as u32;
    let second = (rem % 60) as u32;

    // days since 1970-01-01 -> civil date
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    let year = if m <= 2 { y + 1 } else { y };
    (year, m, d, hour, minute, second)
}

/// Compact timestamp for filenames: "YYYYMMDD-HHMMSS".
pub fn stamp(secs: u64) -> String {
    let (y, m, d, h, mi, s) = ymd_hms(secs);
    format!("{y:04}{m:02}{d:02}-{h:02}{mi:02}{s:02}")
}

/// ISO-8601 UTC timestamp: "YYYY-MM-DDTHH:MM:SSZ".
pub fn iso_from_ms(ms: u64) -> String {
    let (y, m, d, h, mi, s) = ymd_hms(ms / 1000);
    format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// Slugify a string: lowercase alphanumerics kept, everything else becomes '-',
/// collapsed and trimmed. Empty input yields "root". Truncated to 40 chars.
pub fn slug(input: &str) -> String {
    let base = std::path::Path::new(input)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| input.to_string());

    let mut out = String::new();
    let mut prev_dash = false;
    for c in base.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let trimmed = out.trim_matches('-');
    let s: String = trimmed.chars().take(40).collect();
    if s.is_empty() {
        "root".to_string()
    } else {
        s
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ymd_hms_known_values() {
        // 2021-01-01T00:00:00Z = 1609459200
        assert_eq!(ymd_hms(1_609_459_200), (2021, 1, 1, 0, 0, 0));
        // 1970-01-01T00:00:00Z
        assert_eq!(ymd_hms(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(iso_from_ms(1_609_459_200_000), "2021-01-01T00:00:00Z");
    }

    #[test]
    fn slug_basics() {
        assert_eq!(slug("/Users/alice/Music"), "music");
        assert_eq!(slug("/"), "root");
    }
}
