use serde_json::Value;

use crate::AppError;

/// The portal half of the `account` key in `store.json`, validated as a whole.
///
/// Every field is required, so holding one is proof the app has everything it
/// needs to log in. Config is read through this type *before* Chromium is
/// launched, rather than discovering a missing value part-way through login
/// and paying for a browser startup to find out.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct PortalAccountConfig {
    phone: String,
    portal_url: String,
    portal_credential: String,
}

impl PortalAccountConfig {
    /// Parses the value stored under the `account` key.
    ///
    /// Field order is load-bearing: when a store is missing several fields, the
    /// first one checked is the message the user sees.
    pub(crate) fn from_store_value(account: Option<&Value>) -> Result<Self, AppError> {
        let phone = required_str(account, "phone", "Phone number not configured")?;
        let portal_url = required_str(account, "portal_url", "Portal URL not configured")?;
        let portal_credential = required_str(
            account,
            "portal_credential",
            "Portal credential not configured",
        )?;
        Ok(Self {
            phone,
            portal_url: normalize_portal_url(&portal_url).to_string(),
            // Basic-auth `user:pass`, encoded verbatim — never trimmed or
            // otherwise reshaped, since any byte may be part of the password.
            portal_credential,
        })
    }

    pub(crate) fn phone(&self) -> &str {
        &self.phone
    }

    pub(crate) fn portal_url(&self) -> &str {
        &self.portal_url
    }

    pub(crate) fn portal_credential(&self) -> &str {
        &self.portal_credential
    }
}

/// Reads a required string field, erroring with `missing_msg` when the account
/// value, the field, or its contents are absent, empty, or not a string. The
/// store is written by our own frontend, so a wrongly typed value is treated
/// as unconfigured rather than given its own message.
fn required_str(
    account: Option<&Value>,
    field: &str,
    missing_msg: &'static str,
) -> Result<String, AppError> {
    account
        .and_then(|value| value.get(field))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(String::from)
        .ok_or_else(|| AppError::from(missing_msg))
}

/// Trailing slashes are trimmed defensively — callers join paths as
/// `format!("{base_url}/task.php")` — though the frontend already normalizes
/// on save. Also applied to candidate values in `verify_portal_login`, which
/// run before the frontend has saved anything.
pub(crate) fn normalize_portal_url(url: &str) -> &str {
    url.trim_end_matches('/')
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::PortalAccountConfig;

    fn configured() -> Value {
        json!({
            "phone": "0812345678",
            "portal_url": "https://portal.example.com",
            "portal_credential": "user:pass",
        })
    }

    fn error_for(account: Option<&Value>) -> String {
        PortalAccountConfig::from_store_value(account)
            .unwrap_err()
            .to_string()
    }

    /// Replaces one field of an otherwise valid account, or removes it when
    /// `value` is `None`.
    fn with_field(field: &str, value: Option<Value>) -> Value {
        let mut account = configured();
        let object = account.as_object_mut().unwrap();
        match value {
            Some(value) => object.insert(field.into(), value),
            None => object.remove(field),
        };
        account
    }

    #[test]
    fn a_fully_configured_account_is_read() {
        let config = PortalAccountConfig::from_store_value(Some(&configured())).unwrap();

        assert_eq!(
            (
                config.phone(),
                config.portal_url(),
                config.portal_credential()
            ),
            ("0812345678", "https://portal.example.com", "user:pass")
        );
    }

    #[test]
    fn an_absent_or_unusable_account_value_reports_the_first_required_field() {
        let missing_key = error_for(None);
        let null = error_for(Some(&Value::Null));
        let not_an_object = error_for(Some(&json!("portal.example.com")));

        assert_eq!(
            (missing_key, null, not_an_object),
            (
                "Phone number not configured".into(),
                "Phone number not configured".into(),
                "Phone number not configured".into(),
            )
        );
    }

    #[test]
    fn each_missing_field_reports_its_own_message() {
        let messages = ["phone", "portal_url", "portal_credential"]
            .map(|field| error_for(Some(&with_field(field, None))));

        assert_eq!(
            messages,
            [
                "Phone number not configured",
                "Portal URL not configured",
                "Portal credential not configured",
            ]
        );
    }

    #[test]
    fn empty_values_count_as_unconfigured() {
        let messages = ["phone", "portal_url", "portal_credential"]
            .map(|field| error_for(Some(&with_field(field, Some(json!(""))))));

        assert_eq!(
            messages,
            [
                "Phone number not configured",
                "Portal URL not configured",
                "Portal credential not configured",
            ]
        );
    }

    #[test]
    fn wrongly_typed_values_count_as_unconfigured() {
        let messages = [json!(812345678), json!(true), json!(null), json!(["0812"])]
            .map(|value| error_for(Some(&with_field("phone", Some(value)))));

        assert_eq!(messages, ["Phone number not configured"; 4]);
    }

    #[test]
    fn trailing_slashes_are_trimmed_from_the_portal_url() {
        let urls = [
            "https://portal.example.com",
            "https://portal.example.com/",
            "https://portal.example.com///",
            "https://portal.example.com/team",
        ]
        .map(|url| {
            PortalAccountConfig::from_store_value(Some(&with_field("portal_url", Some(json!(url)))))
                .unwrap()
                .portal_url()
                .to_string()
        });

        assert_eq!(
            urls,
            [
                "https://portal.example.com",
                "https://portal.example.com",
                "https://portal.example.com",
                "https://portal.example.com/team",
            ]
        );
    }

    #[test]
    fn the_portal_credential_is_preserved_verbatim() {
        // Any byte can be part of a password, so nothing here may be trimmed,
        // normalized, or split on the `:` separator.
        let credential = "  admin:p a/s:s//  ";

        let config = PortalAccountConfig::from_store_value(Some(&with_field(
            "portal_credential",
            Some(json!(credential)),
        )))
        .unwrap();

        assert_eq!(config.portal_credential(), credential);
    }

    #[test]
    fn a_late_missing_field_still_fails_before_any_config_is_usable() {
        // Phone and URL are valid; the credential is not. Nothing partially
        // built is handed back, so a browser is never launched for a config
        // that cannot complete login.
        let error = error_for(Some(&with_field("portal_credential", None)));

        assert_eq!(error, "Portal credential not configured");
    }
}
