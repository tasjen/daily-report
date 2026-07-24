use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use tokio::sync::Mutex;

use crate::{account::PortalAccountConfig, AppError};

/// How long login waits for the portal to redirect to the member page.
pub(crate) const LOGIN_TIMEOUT: Duration = Duration::from_secs(5);

/// The page operations login needs, so the sequence itself can be tested
/// without Chromium. The real implementation lives in `lib.rs`.
#[allow(async_fn_in_trait)]
pub(crate) trait LoginPortal {
    /// Sets the `Authorization: Basic <token>` header for the admin site's
    /// HTTP basic gate.
    async fn set_basic_auth(&mut self, token: &str) -> Result<(), AppError>;
    async fn goto(&mut self, url: &str) -> Result<(), AppError>;
    /// Types `phone` into the login input and submits its form.
    async fn submit_phone(&mut self, phone: &str) -> Result<(), AppError>;
    async fn wait_for_url(&mut self, expected: &str, timeout: Duration) -> Result<(), AppError>;
}

/// The portal login sequence, shared by the persistent browser sessions
/// (values from `store.json`) and by `verify_portal_login` (candidate values
/// from the Account form), so the two can never drift apart.
pub(crate) struct PortalLogin;

impl PortalLogin {
    pub(crate) async fn execute<P: LoginPortal>(
        config: &PortalAccountConfig,
        label: &str,
        portal: &mut P,
    ) -> Result<(), AppError> {
        // The credential is `user:pass` and goes in verbatim: any byte may be
        // part of the password, so it is never trimmed or split on `:`.
        portal
            .set_basic_auth(&STANDARD.encode(config.portal_credential()))
            .await?;
        portal.goto(config.portal_url()).await?;
        portal.submit_phone(config.phone()).await?;
        portal
            .wait_for_url(
                &format!("{}/member.php", config.portal_url()),
                LOGIN_TIMEOUT,
            )
            .await
            .map_err(|error| {
                log::warn!("{label} browser login failed: {error}");
                AppError::from(format!(
                    "{error}\nWrong phone number, portal URL, or portal credential — or the portal was slow to respond"
                ))
            })?;
        log::info!("{label} browser logged into portal");
        Ok(())
    }
}

/// Builds the JS that fills and submits the login form.
///
/// Both interpolated values go through `serde_json::to_string`. The selector
/// contains single quotes (`input[type='text']`), so hand-wrapping it in
/// `'...'` breaks the script; the phone is user-supplied and validated only as
/// non-empty, so a raw apostrophe would break the script and a crafted value
/// would inject into the portal page.
pub(crate) fn login_script(selector: &str, phone: &str) -> Result<String, AppError> {
    let selector_js = serde_json::to_string(selector)?;
    let phone_js = serde_json::to_string(phone)?;
    Ok(format!(
        "
            const phoneInput = document.querySelector({selector_js});
            phoneInput.value = {phone_js};
            phoneInput.form.submit();
        "
    ))
}

/// The throwaway browser `verify_portal_login` drives, behind a testable
/// boundary. `Page` is separate from `Browser` so a verification can be logging
/// in through the page while the browser sits parked for app exit to kill.
#[allow(async_fn_in_trait)]
pub(crate) trait VerifyHost {
    type Browser;
    type Page;

    /// Launches a throwaway headless browser in its own profile dir.
    async fn launch(&self) -> Result<(Self::Browser, Self::Page), AppError>;
    async fn login(&self, page: &Self::Page, config: &PortalAccountConfig) -> Result<(), AppError>;
    async fn kill(&self, browser: &mut Self::Browser);
}

/// Runs candidate-credential verifications one at a time.
///
/// The browser is throwaway: it is killed whether the check passes or fails,
/// and it is parked where app exit can reach it, since a verification may be
/// in flight when the user quits.
pub(crate) struct VerifySession<H: VerifyHost> {
    /// Serializes verifications — they share one profile dir.
    running: Mutex<()>,
    /// The in-flight browser. A *separate* lock from `running` on purpose: app
    /// exit must be able to seize and kill it without first waiting for the
    /// very verification it is trying to abort.
    parked: Mutex<Option<H::Browser>>,
    host: H,
}

impl<H: VerifyHost> VerifySession<H> {
    pub(crate) fn new(host: H) -> Self {
        Self {
            running: Mutex::new(()),
            parked: Mutex::new(None),
            host,
        }
    }

    #[cfg(test)]
    pub(crate) fn host(&self) -> &H {
        &self.host
    }

    pub(crate) async fn verify(&self, config: &PortalAccountConfig) -> Result<(), AppError> {
        let _serialized = self.running.lock().await;
        let (browser, page) = self.host.launch().await?;
        *self.parked.lock().await = Some(browser);
        let result = self.host.login(&page, config).await;
        // Throwaway either way: nothing here is worth keeping after the check.
        self.kill_parked().await;
        result
    }

    /// Kills the parked browser if one is in flight. Called after every check
    /// and by the app's `Exit` handler. A no-op when nothing is parked.
    pub(crate) async fn kill_parked(&self) {
        if let Some(mut browser) = self.parked.lock().await.take() {
            self.host.kill(&mut browser).await;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        cell::{Cell, RefCell},
        future::pending,
        time::Duration,
    };

    use base64::{engine::general_purpose::STANDARD, Engine};

    use crate::{account::PortalAccountConfig, AppError};

    use super::{login_script, LoginPortal, PortalLogin, VerifyHost, VerifySession, LOGIN_TIMEOUT};

    fn config() -> PortalAccountConfig {
        PortalAccountConfig::from_candidates(
            "0812345678".into(),
            "https://portal.example.com".into(),
            "user:pass".into(),
        )
        .unwrap()
    }

    /// What login asked of the page, in order.
    #[derive(Debug, Clone, PartialEq, Eq)]
    enum Step {
        BasicAuth(String),
        Goto(String),
        SubmittedPhone(String),
        WaitedFor(String, Duration),
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum FailAt {
        BasicAuth,
        Goto,
        SubmitPhone,
        WaitForUrl,
    }

    #[derive(Default)]
    struct FakeLoginPortal {
        steps: RefCell<Vec<Step>>,
        failure: Option<FailAt>,
    }

    impl FakeLoginPortal {
        fn failing_at(failure: FailAt) -> Self {
            Self {
                failure: Some(failure),
                ..Self::default()
            }
        }

        fn steps(&self) -> Vec<Step> {
            self.steps.borrow().clone()
        }

        fn record(&self, step: Step, failure: FailAt) -> Result<(), AppError> {
            if self.failure == Some(failure) {
                return Err("page call failed".into());
            }
            self.steps.borrow_mut().push(step);
            Ok(())
        }
    }

    impl LoginPortal for FakeLoginPortal {
        async fn set_basic_auth(&mut self, token: &str) -> Result<(), AppError> {
            self.record(Step::BasicAuth(token.into()), FailAt::BasicAuth)
        }

        async fn goto(&mut self, url: &str) -> Result<(), AppError> {
            self.record(Step::Goto(url.into()), FailAt::Goto)
        }

        async fn submit_phone(&mut self, phone: &str) -> Result<(), AppError> {
            self.record(Step::SubmittedPhone(phone.into()), FailAt::SubmitPhone)
        }

        async fn wait_for_url(
            &mut self,
            expected: &str,
            timeout: Duration,
        ) -> Result<(), AppError> {
            self.record(
                Step::WaitedFor(expected.into(), timeout),
                FailAt::WaitForUrl,
            )
        }
    }

    #[tokio::test]
    async fn login_drives_the_portal_in_order_with_the_configured_values() {
        let mut portal = FakeLoginPortal::default();

        PortalLogin::execute(&config(), "headless", &mut portal)
            .await
            .unwrap();

        assert_eq!(
            portal.steps(),
            vec![
                Step::BasicAuth(STANDARD.encode("user:pass")),
                Step::Goto("https://portal.example.com".into()),
                Step::SubmittedPhone("0812345678".into()),
                Step::WaitedFor(
                    "https://portal.example.com/member.php".into(),
                    LOGIN_TIMEOUT
                ),
            ]
        );
    }

    #[tokio::test]
    async fn the_basic_auth_token_encodes_the_credential_verbatim() {
        // Colons, spaces and slashes are all legal password bytes.
        let credential = " admin:p a/s:s ";
        let config = PortalAccountConfig::from_candidates(
            "0812345678".into(),
            "https://portal.example.com".into(),
            credential.into(),
        )
        .unwrap();
        let mut portal = FakeLoginPortal::default();

        PortalLogin::execute(&config, "headless", &mut portal)
            .await
            .unwrap();

        let Some(Step::BasicAuth(token)) = portal.steps().into_iter().next() else {
            panic!("login did not set a basic-auth header first");
        };
        assert_eq!(STANDARD.decode(token).unwrap(), credential.as_bytes());
    }

    #[tokio::test]
    async fn a_login_timeout_names_the_likely_causes() {
        let mut portal = FakeLoginPortal::failing_at(FailAt::WaitForUrl);

        let error = PortalLogin::execute(&config(), "headless", &mut portal)
            .await
            .unwrap_err();

        assert_eq!(
            error.to_string(),
            "page call failed\nWrong phone number, portal URL, or portal credential — or the portal was slow to respond"
        );
    }

    #[tokio::test]
    async fn a_failure_stops_login_and_is_reported_unchanged() {
        let mut outcomes = Vec::new();
        for failure in [FailAt::BasicAuth, FailAt::Goto, FailAt::SubmitPhone] {
            let mut portal = FakeLoginPortal::failing_at(failure);
            let error = PortalLogin::execute(&config(), "headless", &mut portal)
                .await
                .unwrap_err();
            outcomes.push((error.to_string(), portal.steps().len()));
        }

        // Each failure aborts immediately, so the recorded steps are exactly
        // the ones before it, and the underlying error reaches the caller
        // unchanged — only a login *timeout* gets the extra explanation.
        assert_eq!(
            outcomes,
            [
                ("page call failed".to_string(), 0),
                ("page call failed".to_string(), 1),
                ("page call failed".to_string(), 2),
            ]
        );
    }

    #[test]
    fn the_login_script_escapes_the_phone_number() {
        let script = login_script("input[type='text']", "081'; alert(1); //").unwrap();

        assert!(
            script.contains(r#"phoneInput.value = "081'; alert(1); //";"#),
            "the phone must be a JSON-escaped literal, got: {script}"
        );
        assert!(
            script.contains(r#"querySelector("input[type='text']")"#),
            "the selector must be a JSON-escaped literal, got: {script}"
        );
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum VerifyEvent {
        Launched(usize),
        LoggedIn(usize),
        Killed(usize),
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct FakeBrowser(usize);

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct FakePage(usize);

    #[derive(Default)]
    struct FakeVerifyHost {
        events: RefCell<Vec<VerifyEvent>>,
        launches: Cell<usize>,
        launch_fails: Cell<bool>,
        login_fails: Cell<bool>,
        login_hangs: Cell<bool>,
        login_delay: Cell<Duration>,
        seen_config: RefCell<Vec<String>>,
    }

    impl FakeVerifyHost {
        fn events(&self) -> Vec<VerifyEvent> {
            self.events.borrow().clone()
        }
    }

    impl VerifyHost for FakeVerifyHost {
        type Browser = FakeBrowser;
        type Page = FakePage;

        async fn launch(&self) -> Result<(FakeBrowser, FakePage), AppError> {
            if self.launch_fails.get() {
                return Err("launch failed".into());
            }
            let id = self.launches.get() + 1;
            self.launches.set(id);
            self.events.borrow_mut().push(VerifyEvent::Launched(id));
            Ok((FakeBrowser(id), FakePage(id)))
        }

        async fn login(
            &self,
            page: &FakePage,
            config: &PortalAccountConfig,
        ) -> Result<(), AppError> {
            self.seen_config.borrow_mut().push(format!(
                "{}|{}|{}",
                config.phone(),
                config.portal_url(),
                config.portal_credential()
            ));
            if self.login_hangs.get() {
                pending::<()>().await;
            }
            let delay = self.login_delay.get();
            if !delay.is_zero() {
                tokio::time::sleep(delay).await;
            }
            if self.login_fails.get() {
                return Err("wrong phone number".into());
            }
            self.events.borrow_mut().push(VerifyEvent::LoggedIn(page.0));
            Ok(())
        }

        async fn kill(&self, browser: &mut FakeBrowser) {
            self.events
                .borrow_mut()
                .push(VerifyEvent::Killed(browser.0));
        }
    }

    fn verify_session() -> VerifySession<FakeVerifyHost> {
        VerifySession::new(FakeVerifyHost::default())
    }

    #[tokio::test]
    async fn a_successful_verification_kills_its_throwaway_browser() {
        let session = verify_session();

        session.verify(&config()).await.unwrap();

        assert_eq!(
            session.host().events(),
            vec![
                VerifyEvent::Launched(1),
                VerifyEvent::LoggedIn(1),
                VerifyEvent::Killed(1)
            ]
        );
    }

    #[tokio::test]
    async fn a_failed_verification_still_kills_its_throwaway_browser() {
        let session = verify_session();
        session.host().login_fails.set(true);

        let error = session.verify(&config()).await.unwrap_err();

        assert_eq!(
            (error.to_string(), session.host().events()),
            (
                "wrong phone number".into(),
                vec![VerifyEvent::Launched(1), VerifyEvent::Killed(1)]
            )
        );
    }

    #[tokio::test]
    async fn verification_logs_in_with_the_candidate_values_it_was_given() {
        let session = verify_session();
        let candidate = PortalAccountConfig::from_candidates(
            "0899999999".into(),
            "https://other.example.com/".into(),
            "other:secret".into(),
        )
        .unwrap();

        session.verify(&candidate).await.unwrap();

        assert_eq!(
            session.host().seen_config.borrow().as_slice(),
            ["0899999999|https://other.example.com|other:secret"]
        );
    }

    #[tokio::test]
    async fn a_failed_launch_parks_nothing_to_kill() {
        let session = verify_session();
        session.host().launch_fails.set(true);

        let error = session.verify(&config()).await.unwrap_err();
        session.kill_parked().await;

        assert_eq!(
            (error.to_string(), session.host().events()),
            ("launch failed".into(), vec![])
        );
    }

    #[tokio::test(start_paused = true)]
    async fn concurrent_verifications_are_serialized() {
        let session = verify_session();
        session.host().login_delay.set(Duration::from_millis(500));
        let config = config();

        let (first, second) = tokio::join!(session.verify(&config), session.verify(&config));

        first.unwrap();
        second.unwrap();
        // Fully interleaved runs would read Launched, Launched, ... — they
        // share one profile dir, so each must finish before the next starts.
        assert_eq!(
            session.host().events(),
            vec![
                VerifyEvent::Launched(1),
                VerifyEvent::LoggedIn(1),
                VerifyEvent::Killed(1),
                VerifyEvent::Launched(2),
                VerifyEvent::LoggedIn(2),
                VerifyEvent::Killed(2),
            ]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn app_exit_during_a_verification_kills_the_parked_browser() {
        let session = verify_session();
        session.host().login_hangs.set(true);
        let config = config();
        let verifying = session.verify(&config);
        tokio::pin!(verifying);

        // Stand in for `RunEvent::Exit` arriving mid-login: the exit path must
        // not have to wait for the check it is aborting.
        let events = tokio::select! {
            _ = &mut verifying => panic!("the hung verification should not finish"),
            events = async {
                tokio::time::sleep(Duration::from_millis(10)).await;
                session.kill_parked().await;
                session.host().events()
            } => events,
        };

        assert_eq!(
            events,
            vec![VerifyEvent::Launched(1), VerifyEvent::Killed(1)]
        );
    }

    #[tokio::test]
    async fn killing_a_parked_browser_when_none_is_in_flight_is_harmless() {
        let session = verify_session();

        session.kill_parked().await;
        session.verify(&config()).await.unwrap();
        session.kill_parked().await;

        assert_eq!(
            session.host().events(),
            vec![
                VerifyEvent::Launched(1),
                VerifyEvent::LoggedIn(1),
                VerifyEvent::Killed(1)
            ]
        );
    }
}
