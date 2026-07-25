use std::{future::Future, time::Duration};

const URL_PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const URL_POLL_INTERVAL: Duration = Duration::from_millis(200);

/// Expected navigation target. A URL matches when it equals the expectation,
/// or extends it at a path/query/fragment boundary — so redirect-added query
/// parameters, fragments, and trailing slashes count as arrival, while a
/// differently-named sibling route (`/member.php-old`) does not.
pub(crate) struct UrlExpectation(String);

/// Characters that may follow the expected URL without changing which route it
/// names.
const URL_BOUNDARY: [char; 3] = ['?', '#', '/'];

impl UrlExpectation {
    pub(crate) fn new(expected: impl Into<String>) -> Self {
        Self(expected.into())
    }

    pub(crate) fn matches(&self, actual: &str) -> bool {
        actual
            .strip_prefix(&self.0)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with(URL_BOUNDARY))
    }

    fn as_str(&self) -> &str {
        &self.0
    }
}

/// Polls a URL source immediately and then at a fixed interval until the
/// expectation matches. The outer timeout bounds the whole operation, while
/// each URL probe retains its shorter diagnostic timeout.
pub(crate) async fn wait_for_navigation<F, Fut>(
    expectation: &UrlExpectation,
    timeout: Duration,
    mut current_url: F,
) -> Result<(), crate::AppError>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<Option<String>, crate::AppError>>,
{
    let poll = async {
        loop {
            let url = tokio::time::timeout(URL_PROBE_TIMEOUT, current_url())
                .await
                .map_err(|_| crate::AppError::from("page.url() timed out"))??;
            if url
                .as_deref()
                .is_some_and(|actual| expectation.matches(actual))
            {
                return Ok(());
            }
            tokio::time::sleep(URL_POLL_INTERVAL).await;
        }
    };
    match tokio::time::timeout(timeout, poll).await {
        Ok(result) => result,
        Err(_) => Err(format!("Timed out waiting for URL: {}", expectation.as_str()).into()),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        cell::{Cell, RefCell},
        collections::VecDeque,
        future::{pending, ready},
        time::Duration,
    };

    use crate::AppError;

    use super::{wait_for_navigation, UrlExpectation};

    #[test]
    fn exact_url_matches() {
        let expectation = UrlExpectation::new("https://portal.example.com/member.php");

        assert!(expectation.matches("https://portal.example.com/member.php"));
    }

    #[test]
    fn redirect_suffixes_at_a_url_boundary_match() {
        let expectation = UrlExpectation::new("https://portal.example.com/member.php");
        let matches = [
            "https://portal.example.com/member.php?from=login",
            "https://portal.example.com/member.php#report",
            "https://portal.example.com/member.php/",
            "https://portal.example.com/member.php/detail?id=1",
        ]
        .map(|actual| expectation.matches(actual));

        assert_eq!(matches, [true; 4]);
    }

    #[test]
    fn routes_that_only_share_a_prefix_do_not_match() {
        let expectation = UrlExpectation::new("https://portal.example.com/member.php");
        let matches = [
            "https://portal.example.com/task.php",
            "https://portal.example.com/member.php-old",
            "https://portal.example.com/member.phpx",
            "https://portal.example.com/member.php_backup?from=login",
            "https://portal.example.com/member.ph",
        ]
        .map(|actual| expectation.matches(actual));

        assert_eq!(matches, [false; 5]);
    }

    #[tokio::test(start_paused = true)]
    async fn already_reached_url_succeeds_without_polling_delay() {
        let expectation = UrlExpectation::new("https://portal.example.com/member.php");
        let probes = Cell::new(0);
        let started = tokio::time::Instant::now();

        wait_for_navigation(&expectation, Duration::from_secs(5), || {
            probes.set(probes.get() + 1);
            ready(Ok(Some(
                "https://portal.example.com/member.php".to_string(),
            )))
        })
        .await
        .unwrap();

        assert_eq!(
            (probes.get(), tokio::time::Instant::now() - started),
            (1, Duration::ZERO)
        );
    }

    #[tokio::test(start_paused = true)]
    async fn navigation_is_polled_until_the_expected_url_arrives() {
        let expectation = UrlExpectation::new("https://portal.example.com/member.php");
        let urls = RefCell::new(VecDeque::from([
            Some("https://portal.example.com/login.php".to_string()),
            Some("https://portal.example.com/member.php?from=login".to_string()),
        ]));
        let started = tokio::time::Instant::now();

        wait_for_navigation(&expectation, Duration::from_secs(5), || {
            ready(Ok(urls.borrow_mut().pop_front().flatten()))
        })
        .await
        .unwrap();

        assert_eq!(
            tokio::time::Instant::now() - started,
            Duration::from_millis(200)
        );
    }

    #[tokio::test(start_paused = true)]
    async fn overall_timeout_is_bounded_and_names_the_expected_url() {
        let expectation = UrlExpectation::new("https://portal.example.com/member.php");
        let started = tokio::time::Instant::now();

        let error = tokio::time::timeout(
            Duration::from_secs(1),
            wait_for_navigation(&expectation, Duration::from_millis(600), || {
                ready(Ok(Some("https://portal.example.com/login.php".to_string())))
            }),
        )
        .await
        .expect("navigation wait ignored its configured timeout")
        .unwrap_err();

        assert_eq!(
            (error.to_string(), tokio::time::Instant::now() - started,),
            (
                "Timed out waiting for URL: https://portal.example.com/member.php".into(),
                Duration::from_millis(600),
            )
        );
    }

    #[tokio::test(start_paused = true)]
    async fn url_probe_errors_are_propagated_and_slow_probes_have_their_own_timeout() {
        let expectation = UrlExpectation::new("https://portal.example.com/member.php");

        let direct_started = tokio::time::Instant::now();
        let direct_error = wait_for_navigation(&expectation, Duration::from_secs(5), || {
            ready(Err::<Option<String>, _>(AppError::from("URL read failed")))
        })
        .await
        .unwrap_err();
        let direct_elapsed = tokio::time::Instant::now() - direct_started;

        let slow_started = tokio::time::Instant::now();
        let slow_error = wait_for_navigation(&expectation, Duration::from_secs(5), || {
            pending::<Result<Option<String>, AppError>>()
        })
        .await
        .unwrap_err();
        let slow_elapsed = tokio::time::Instant::now() - slow_started;

        assert_eq!(
            (
                (direct_error.to_string(), direct_elapsed),
                (slow_error.to_string(), slow_elapsed),
            ),
            (
                ("URL read failed".into(), Duration::ZERO),
                ("page.url() timed out".into(), Duration::from_secs(2)),
            )
        );
    }
}
