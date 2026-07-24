use std::time::Duration;

use tokio::sync::Mutex;

use crate::AppError;

/// How long a graceful shutdown may take before the process is force-killed.
/// If the user already closed the window the CDP connection is gone, so the
/// close command can never be delivered and `wait()` would block forever.
pub(crate) const GRACEFUL_CLOSE_TIMEOUT: Duration = Duration::from_secs(3);

/// The system boundary a `BrowserSession` drives: launching a logged-in
/// browser, probing whether one can still be driven, and terminating it. Only
/// the Chromium implementation in `lib.rs` touches a real process; the session
/// owns the reuse and teardown policy above it.
#[allow(async_fn_in_trait)]
pub(crate) trait BrowserHost {
    type Browser;
    type Page: Clone;

    /// Which instance this is, for log lines.
    fn label(&self) -> &'static str;

    /// Launches a fresh browser and completes login, so a returned page is
    /// always ready to drive.
    async fn launch(&self) -> Result<(Self::Browser, Self::Page), AppError>;

    /// Whether `page` can still be driven. Must probe the live session rather
    /// than cached state or the process.
    async fn is_page_alive(&self, page: &Self::Page) -> bool;

    /// Best-effort graceful shutdown. May never return if the connection is
    /// already gone — the session bounds it with `GRACEFUL_CLOSE_TIMEOUT`.
    async fn close(&self, browser: &mut Self::Browser, page: Self::Page);

    /// Force-kills the process. Used when the connection is gone, so a
    /// graceful close could not be delivered.
    async fn kill(&self, browser: &mut Self::Browser);
}

/// One lazily-launched browser instance, reused across commands.
///
/// Holds at most one live `(browser, page)` pair. Every path that gives up a
/// session removes it from the state *before* shutting it down, so a failed
/// launch or a hung close can never leave a stale pair behind for the next
/// caller to reuse.
pub(crate) struct BrowserSession<H: BrowserHost> {
    inner: Mutex<Option<(H::Browser, H::Page)>>,
    host: H,
}

impl<H: BrowserHost> BrowserSession<H> {
    pub(crate) fn new(host: H) -> Self {
        Self {
            inner: Mutex::new(None),
            host,
        }
    }

    pub(crate) fn host(&self) -> &H {
        &self.host
    }

    /// Returns a driveable page, reusing the cached session when it still
    /// responds and otherwise replacing it.
    ///
    /// The lock is held across the launch, so concurrent callers produce one
    /// session rather than racing two browsers into the same profile dir.
    pub(crate) async fn get_page(&self) -> Result<H::Page, AppError> {
        let mut guard = self.inner.lock().await;
        if let Some((_, page)) = guard.as_ref() {
            if self.host.is_page_alive(page).await {
                return Ok(page.clone());
            }
            log::warn!(
                "cached {} browser session no longer responds, relaunching",
                self.host.label()
            );
        }
        // Either there is no cached browser, or the cached one can no longer be
        // driven (e.g. the user closed the window). Force-kill any lingering
        // process and drop it so a fresh instance is launched below. `kill`
        // rather than `close` + `wait`: once the connection is gone the close
        // command can't be delivered, so `wait` would block forever.
        if let Some((mut browser, _page)) = guard.take() {
            self.host.kill(&mut browser).await;
        }
        let (browser, page) = self.host.launch().await?;
        *guard = Some((browser, page.clone()));
        Ok(page)
    }

    /// Tears down the session if one is active. Safe to call repeatedly and on
    /// an empty session.
    pub(crate) async fn close(&self) {
        let mut guard = self.inner.lock().await;
        let Some((mut browser, page)) = guard.take() else {
            return;
        };
        log::info!("closing {} browser", self.host.label());
        if tokio::time::timeout(GRACEFUL_CLOSE_TIMEOUT, self.host.close(&mut browser, page))
            .await
            .is_err()
        {
            log::warn!(
                "graceful close of {} browser timed out, force-killing",
                self.host.label()
            );
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

    use crate::AppError;

    use super::{BrowserHost, BrowserSession, GRACEFUL_CLOSE_TIMEOUT};

    /// What the session did to the system boundary, in order. Ids distinguish
    /// one launched instance from its replacement.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum Event {
        Launched(usize),
        Probed(usize),
        ClosedGracefully(usize),
        Killed(usize),
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct FakeBrowser(usize);

    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    struct FakePage(usize);

    #[derive(Default)]
    struct FakeHost {
        label: &'static str,
        events: RefCell<Vec<Event>>,
        launches: Cell<usize>,
        page_alive: Cell<bool>,
        launch_fails: Cell<bool>,
        close_hangs: Cell<bool>,
        launch_delay: Cell<Duration>,
    }

    impl FakeHost {
        fn new(label: &'static str) -> Self {
            Self {
                label,
                page_alive: Cell::new(true),
                ..Self::default()
            }
        }

        fn events(&self) -> Vec<Event> {
            self.events.borrow().clone()
        }

        fn record(&self, event: Event) {
            self.events.borrow_mut().push(event);
        }
    }

    impl BrowserHost for FakeHost {
        type Browser = FakeBrowser;
        type Page = FakePage;

        fn label(&self) -> &'static str {
            self.label
        }

        async fn launch(&self) -> Result<(FakeBrowser, FakePage), AppError> {
            if self.launch_fails.get() {
                return Err("launch failed".into());
            }
            let delay = self.launch_delay.get();
            if !delay.is_zero() {
                tokio::time::sleep(delay).await;
            }
            let id = self.launches.get() + 1;
            self.launches.set(id);
            self.record(Event::Launched(id));
            Ok((FakeBrowser(id), FakePage(id)))
        }

        async fn is_page_alive(&self, page: &FakePage) -> bool {
            self.record(Event::Probed(page.0));
            self.page_alive.get()
        }

        async fn close(&self, browser: &mut FakeBrowser, _page: FakePage) {
            if self.close_hangs.get() {
                pending::<()>().await;
            }
            self.record(Event::ClosedGracefully(browser.0));
        }

        async fn kill(&self, browser: &mut FakeBrowser) {
            self.record(Event::Killed(browser.0));
        }
    }

    fn session() -> BrowserSession<FakeHost> {
        BrowserSession::new(FakeHost::new("headless"))
    }

    #[tokio::test]
    async fn the_first_request_launches_a_logged_in_session() {
        let session = session();

        let page = session.get_page().await.unwrap();

        assert_eq!(
            (page, session.host().events()),
            (FakePage(1), vec![Event::Launched(1)])
        );
    }

    #[tokio::test]
    async fn a_responsive_cached_page_is_reused_without_relaunching() {
        let session = session();

        let first = session.get_page().await.unwrap();
        let second = session.get_page().await.unwrap();

        assert_eq!(
            (first, second, session.host().events()),
            (
                FakePage(1),
                FakePage(1),
                vec![Event::Launched(1), Event::Probed(1)]
            )
        );
    }

    #[tokio::test]
    async fn an_unresponsive_cached_page_is_killed_and_replaced_before_get_page_returns() {
        let session = session();
        session.get_page().await.unwrap();

        session.host().page_alive.set(false);
        let page = session.get_page().await.unwrap();

        assert_eq!(
            (page, session.host().events()),
            (
                FakePage(2),
                vec![
                    Event::Launched(1),
                    Event::Probed(1),
                    Event::Killed(1),
                    Event::Launched(2),
                ]
            )
        );
    }

    #[tokio::test]
    async fn a_replacement_session_is_cached_and_reused_like_any_other() {
        let session = session();
        session.get_page().await.unwrap();
        session.host().page_alive.set(false);
        session.get_page().await.unwrap();

        session.host().page_alive.set(true);
        let page = session.get_page().await.unwrap();

        assert_eq!(
            (page, session.host().launches.get()),
            (FakePage(2), 2),
            "the replacement should be reused, not relaunched again"
        );
    }

    #[tokio::test]
    async fn a_failed_launch_caches_nothing_and_the_next_attempt_starts_clean() {
        let session = session();
        session.host().launch_fails.set(true);

        let error = session.get_page().await.unwrap_err();
        session.host().launch_fails.set(false);
        let page = session.get_page().await.unwrap();

        // No `Probed` event: the retry found an empty state rather than a
        // misleading cached session left behind by the failure.
        assert_eq!(
            (error.to_string(), page, session.host().events()),
            (
                "launch failed".into(),
                FakePage(1),
                vec![Event::Launched(1)]
            )
        );
    }

    #[tokio::test(start_paused = true)]
    async fn concurrent_page_requests_produce_only_one_session() {
        let session = session();
        session.host().launch_delay.set(Duration::from_millis(500));

        let (first, second) = tokio::join!(session.get_page(), session.get_page());

        assert_eq!(
            (first.unwrap(), second.unwrap(), session.host().events()),
            (
                FakePage(1),
                FakePage(1),
                vec![Event::Launched(1), Event::Probed(1)]
            )
        );
    }

    #[tokio::test]
    async fn closing_an_empty_session_is_harmless() {
        let session = session();

        session.close().await;
        session.close().await;

        assert_eq!(session.host().events(), vec![]);
    }

    #[tokio::test]
    async fn closing_an_active_session_shuts_the_browser_down_gracefully() {
        let session = session();
        session.get_page().await.unwrap();

        session.close().await;

        assert_eq!(
            session.host().events(),
            vec![Event::Launched(1), Event::ClosedGracefully(1)]
        );
    }

    #[tokio::test(start_paused = true)]
    async fn a_graceful_close_that_hangs_is_force_killed_at_the_timeout() {
        let session = session();
        session.get_page().await.unwrap();
        session.host().close_hangs.set(true);
        let started = tokio::time::Instant::now();

        session.close().await;

        assert_eq!(
            (
                session.host().events(),
                tokio::time::Instant::now() - started
            ),
            (
                vec![Event::Launched(1), Event::Killed(1)],
                GRACEFUL_CLOSE_TIMEOUT
            )
        );
    }

    #[tokio::test]
    async fn repeated_closes_do_not_shut_the_same_browser_down_twice() {
        let session = session();
        session.get_page().await.unwrap();

        session.close().await;
        session.close().await;

        assert_eq!(
            session.host().events(),
            vec![Event::Launched(1), Event::ClosedGracefully(1)]
        );
    }

    #[tokio::test]
    async fn a_closed_session_is_never_reused_so_a_new_account_logs_in_fresh() {
        let session = session();
        session.get_page().await.unwrap();

        session.close().await;
        let page = session.get_page().await.unwrap();

        // No `Probed` event after the close: the old login's session was gone,
        // not merely stale, so it cannot submit as the previous member.
        assert_eq!(
            (page, session.host().events()),
            (
                FakePage(2),
                vec![
                    Event::Launched(1),
                    Event::ClosedGracefully(1),
                    Event::Launched(2),
                ]
            )
        );
    }

    #[tokio::test]
    async fn headed_and_headless_sessions_stay_independent() {
        let headless = BrowserSession::new(FakeHost::new("headless"));
        let headed = BrowserSession::new(FakeHost::new("headed"));
        headless.get_page().await.unwrap();
        headed.get_page().await.unwrap();

        headless.close().await;
        let headed_page = headed.get_page().await.unwrap();

        assert_eq!(
            (
                headed_page,
                headed.host().events(),
                headless.host().events()
            ),
            (
                FakePage(1),
                vec![Event::Launched(1), Event::Probed(1)],
                vec![Event::Launched(1), Event::ClosedGracefully(1)]
            )
        );
    }
}
