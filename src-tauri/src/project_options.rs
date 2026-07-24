use std::future::Future;

use tokio::sync::Mutex;

use crate::{AppError, SelectOption};

/// Caches the project `<select>` options scraped from the portal task form.
///
/// The project list is stable for a given login, so it is scraped once and
/// shared by every caller instead of hitting the form each time. It is *not*
/// stable across logins: `close_browsers` clears it, which covers both moments
/// the identity can change — saving a new account and the long-idle reset — so
/// a different member or portal never inherits the previous one's projects.
pub(crate) struct ProjectOptionsCache(Mutex<Option<Vec<SelectOption>>>);

impl ProjectOptionsCache {
    pub(crate) const fn new() -> Self {
        Self(Mutex::const_new(None))
    }

    /// Returns the cached options, running `scrape` when the cache is empty.
    ///
    /// The lock is held across the scrape, so concurrent first callers wait for
    /// one scrape rather than each driving the form. A failed scrape stores
    /// nothing, leaving the next call free to retry.
    pub(crate) async fn get_or_scrape<F, Fut>(
        &self,
        scrape: F,
    ) -> Result<Vec<SelectOption>, AppError>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<Vec<SelectOption>, AppError>>,
    {
        let mut guard = self.0.lock().await;
        if let Some(cached) = guard.as_ref() {
            return Ok(cached.clone());
        }
        let options = scrape().await?;
        *guard = Some(options.clone());
        Ok(options)
    }

    /// Drops the cached options so the next read scrapes again.
    pub(crate) async fn clear(&self) {
        *self.0.lock().await = None;
    }
}

#[cfg(test)]
mod tests {
    use std::{cell::Cell, future::ready};

    use crate::{AppError, SelectOption};

    use super::ProjectOptionsCache;

    fn options(label: &str) -> Vec<SelectOption> {
        vec![SelectOption {
            label: label.into(),
            value: "1".into(),
        }]
    }

    #[tokio::test]
    async fn the_first_read_scrapes_and_later_reads_reuse_it() {
        let cache = ProjectOptionsCache::new();
        let scrapes = Cell::new(0);
        let scrape = || {
            scrapes.set(scrapes.get() + 1);
            ready(Ok(options("Portal project")))
        };

        let first = cache.get_or_scrape(scrape).await.unwrap();
        let second = cache.get_or_scrape(scrape).await.unwrap();

        assert_eq!(
            (scrapes.get(), first, second),
            (1, options("Portal project"), options("Portal project"))
        );
    }

    #[tokio::test]
    async fn a_failed_initial_scrape_can_be_retried_successfully() {
        let cache = ProjectOptionsCache::new();

        let error = cache
            .get_or_scrape(|| ready(Err::<Vec<SelectOption>, _>(AppError::from("no form"))))
            .await
            .unwrap_err();
        let retried = cache
            .get_or_scrape(|| ready(Ok(options("Portal project"))))
            .await
            .unwrap();

        assert_eq!(
            (error.to_string(), retried),
            ("no form".into(), options("Portal project"))
        );
    }

    #[tokio::test]
    async fn clearing_the_cache_rescrapes_so_a_new_login_cannot_inherit_old_projects() {
        let cache = ProjectOptionsCache::new();
        cache
            .get_or_scrape(|| ready(Ok(options("Old account project"))))
            .await
            .unwrap();

        cache.clear().await;
        let after_clear = cache
            .get_or_scrape(|| ready(Ok(options("New account project"))))
            .await
            .unwrap();

        assert_eq!(after_clear, options("New account project"));
    }

    #[tokio::test(start_paused = true)]
    async fn concurrent_initial_reads_share_a_single_scrape() {
        let cache = ProjectOptionsCache::new();
        let scrapes = Cell::new(0);
        let scrape = || async {
            scrapes.set(scrapes.get() + 1);
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            Ok(options("Portal project"))
        };

        let (first, second) =
            tokio::join!(cache.get_or_scrape(scrape), cache.get_or_scrape(scrape));

        assert_eq!(
            (scrapes.get(), first.unwrap(), second.unwrap()),
            (1, options("Portal project"), options("Portal project"))
        );
    }
}
