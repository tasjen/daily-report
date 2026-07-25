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
        Self::new(
            store_str(account, "phone"),
            store_str(account, "portal_url"),
            store_str(account, "portal_credential"),
        )
    }

    /// Builds a config from the *candidate* values typed into the Account form,
    /// before anything is saved. Deliberately shares `new` with the stored
    /// path: a value must not verify one way and then behave differently once
    /// it lands in `store.json`.
    pub(crate) fn from_candidates(
        phone: String,
        portal_url: String,
        portal_credential: String,
    ) -> Result<Self, AppError> {
        Self::new(phone, portal_url, portal_credential)
    }

    fn new(phone: String, portal_url: String, portal_credential: String) -> Result<Self, AppError> {
        // Field order is what decides the reported message; see the doc above.
        Ok(Self {
            phone: required(phone, "Phone number not configured")?,
            // Normalize *before* validating. A URL of nothing but slashes is
            // non-empty yet trims away to nothing, and an empty base URL would
            // send login to "" and then time out waiting for "/member.php".
            portal_url: required(
                normalize_portal_url(&portal_url).to_string(),
                "Portal URL not configured",
            )?,
            // Basic-auth `user:pass`, encoded verbatim — never trimmed or
            // otherwise reshaped, since any byte may be part of the password.
            portal_credential: required(portal_credential, "Portal credential not configured")?,
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

/// Reads a string field out of the stored account value. An absent account
/// value, an absent field, and a wrongly typed field all collapse to the empty
/// string — the store is written by our own frontend, so a bad type is treated
/// as unconfigured rather than given its own message.
fn store_str(account: Option<&Value>, field: &str) -> String {
    account
        .and_then(|value| value.get(field))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn required(value: String, missing_msg: &'static str) -> Result<String, AppError> {
    if value.is_empty() {
        return Err(AppError::from(missing_msg));
    }
    Ok(value)
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
    fn a_portal_url_that_normalizes_away_is_rejected() {
        // `///` is non-empty but trims to nothing. Accepting it would hand
        // login an empty base URL: it would navigate to "" and then wait for
        // "/member.php", failing with a timeout that blames the phone number.
        let messages = ["/", "//", "///"].map(|url| {
            PortalAccountConfig::from_candidates(
                "0812345678".into(),
                url.into(),
                "user:pass".into(),
            )
            .unwrap_err()
            .to_string()
        });

        assert_eq!(messages, ["Portal URL not configured"; 3]);
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
    fn candidate_values_are_validated_and_normalized_like_stored_ones() {
        let config = PortalAccountConfig::from_candidates(
            "0812345678".into(),
            "https://portal.example.com//".into(),
            "user:pass".into(),
        )
        .unwrap();

        assert_eq!(
            config,
            PortalAccountConfig::from_store_value(Some(&configured())).unwrap(),
            "a candidate must behave exactly as it will once saved"
        );
    }

    #[test]
    fn empty_candidate_values_are_rejected_before_a_browser_is_launched() {
        let messages = [
            ("", "https://portal.example.com", "user:pass"),
            ("0812345678", "", "user:pass"),
            ("0812345678", "https://portal.example.com", ""),
        ]
        .map(|(phone, url, credential)| {
            PortalAccountConfig::from_candidates(phone.into(), url.into(), credential.into())
                .unwrap_err()
                .to_string()
        });

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
    fn a_late_missing_field_still_fails_before_any_config_is_usable() {
        // Phone and URL are valid; the credential is not. Nothing partially
        // built is handed back, so a browser is never launched for a config
        // that cannot complete login.
        let error = error_for(Some(&with_field("portal_credential", None)));

        assert_eq!(error, "Portal credential not configured");
    }
}
