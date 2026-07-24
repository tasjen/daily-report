use serde::Serialize;

use crate::{project_options::ProjectOptionsCache, AppError, SelectOption};

/// The form `<select>` contents the frontend needs to render a date card.
#[derive(Serialize, Debug, PartialEq, Eq)]
pub(crate) struct TaskParameters {
    pub(crate) dates: Vec<SelectOption>,
    pub(crate) leaves: Vec<SelectOption>,
    pub(crate) projects: Vec<SelectOption>,
}

/// The page operations a parameter scrape needs, so the sequence can be tested
/// without Chromium. `ChromiumTaskFormSource` in `lib.rs` is the only real
/// implementation; it owns the selectors.
#[allow(async_fn_in_trait)]
pub(crate) trait TaskFormSource {
    async fn goto_task_form(&self) -> Result<(), AppError>;
    async fn scrape_dates(&self) -> Result<Vec<SelectOption>, AppError>;
    async fn scrape_leaves(&self) -> Result<Vec<SelectOption>, AppError>;
    async fn scrape_projects(&self) -> Result<Vec<SelectOption>, AppError>;
    /// Returns the browser to the member page, so the next command — and the
    /// headed window, if the user looks at it — starts from the portal's home
    /// rather than a half-filled form.
    async fn goto_member_page(&self) -> Result<(), AppError>;
}

pub(crate) struct TaskParametersScrape;

impl TaskParametersScrape {
    /// Reads the task form's selects, then navigates back to the member page.
    ///
    /// Dates and leaves are read fresh every call — the selectable days move
    /// as the portal's reporting window advances. Only the project list goes
    /// through `cache`, because it is stable for a given login.
    pub(crate) async fn run<S: TaskFormSource>(
        source: &S,
        cache: &ProjectOptionsCache,
    ) -> Result<TaskParameters, AppError> {
        source.goto_task_form().await?;
        let dates = source.scrape_dates().await?;
        let leaves = source.scrape_leaves().await?;
        let projects = cache.get_or_scrape(|| source.scrape_projects()).await?;
        source.goto_member_page().await?;
        Ok(TaskParameters {
            dates,
            leaves,
            projects,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};

    use crate::{project_options::ProjectOptionsCache, AppError, SelectOption};

    use super::{TaskFormSource, TaskParametersScrape};

    /// What the scrape asked of the page, in order.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    enum Step {
        GotoTaskForm,
        ScrapedDates,
        ScrapedLeaves,
        ScrapedProjects,
        GotoMemberPage,
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum FailAt {
        GotoTaskForm,
        Dates,
        Projects,
    }

    #[derive(Default)]
    struct FakeTaskForm {
        steps: RefCell<Vec<Step>>,
        failure: Option<FailAt>,
        date_scrapes: Cell<usize>,
        project_scrapes: Cell<usize>,
    }

    impl FakeTaskForm {
        fn failing_at(failure: FailAt) -> Self {
            Self {
                failure: Some(failure),
                ..Self::default()
            }
        }

        fn steps(&self) -> Vec<Step> {
            self.steps.borrow().clone()
        }

        fn record(&self, step: Step) {
            self.steps.borrow_mut().push(step);
        }
    }

    /// Options tagged with the scrape that produced them, so a test can tell a
    /// fresh read from a cached one.
    fn options(kind: &str, run: usize) -> Vec<SelectOption> {
        vec![SelectOption {
            label: format!("{kind} label {run}"),
            value: format!("{kind}-{run}"),
        }]
    }

    impl TaskFormSource for FakeTaskForm {
        async fn goto_task_form(&self) -> Result<(), AppError> {
            if self.failure == Some(FailAt::GotoTaskForm) {
                return Err("task form is unreachable".into());
            }
            self.record(Step::GotoTaskForm);
            Ok(())
        }

        async fn scrape_dates(&self) -> Result<Vec<SelectOption>, AppError> {
            if self.failure == Some(FailAt::Dates) {
                return Err("date select is missing".into());
            }
            self.record(Step::ScrapedDates);
            let run = self.date_scrapes.get() + 1;
            self.date_scrapes.set(run);
            Ok(options("date", run))
        }

        async fn scrape_leaves(&self) -> Result<Vec<SelectOption>, AppError> {
            self.record(Step::ScrapedLeaves);
            Ok(options("leave", self.date_scrapes.get()))
        }

        async fn scrape_projects(&self) -> Result<Vec<SelectOption>, AppError> {
            if self.failure == Some(FailAt::Projects) {
                return Err("project select is missing".into());
            }
            self.record(Step::ScrapedProjects);
            let run = self.project_scrapes.get() + 1;
            self.project_scrapes.set(run);
            Ok(options("project", run))
        }

        async fn goto_member_page(&self) -> Result<(), AppError> {
            self.record(Step::GotoMemberPage);
            Ok(())
        }
    }

    #[tokio::test]
    async fn scraping_opens_the_task_form_reads_it_then_returns_to_the_member_page() {
        let source = FakeTaskForm::default();
        let cache = ProjectOptionsCache::new();

        let parameters = TaskParametersScrape::run(&source, &cache).await.unwrap();

        assert_eq!(
            source.steps(),
            vec![
                Step::GotoTaskForm,
                Step::ScrapedDates,
                Step::ScrapedLeaves,
                Step::ScrapedProjects,
                Step::GotoMemberPage,
            ]
        );
        assert_eq!(
            (parameters.dates, parameters.leaves, parameters.projects),
            (
                options("date", 1),
                options("leave", 1),
                options("project", 1)
            )
        );
    }

    #[tokio::test]
    async fn dates_and_leaves_are_reread_every_call_while_projects_stay_cached() {
        let source = FakeTaskForm::default();
        let cache = ProjectOptionsCache::new();

        let first = TaskParametersScrape::run(&source, &cache).await.unwrap();
        let second = TaskParametersScrape::run(&source, &cache).await.unwrap();

        // The portal's selectable days move as its reporting window advances,
        // so caching them would hand the user a stale date list.
        assert_ne!(first.dates, second.dates);
        assert_ne!(first.leaves, second.leaves);
        assert_eq!(
            (
                first.projects,
                second.projects,
                source.project_scrapes.get()
            ),
            (options("project", 1), options("project", 1), 1)
        );
    }

    #[tokio::test]
    async fn a_failure_reaching_the_task_form_reads_nothing() {
        let source = FakeTaskForm::failing_at(FailAt::GotoTaskForm);
        let cache = ProjectOptionsCache::new();

        let error = TaskParametersScrape::run(&source, &cache)
            .await
            .unwrap_err();

        assert_eq!(
            (error.to_string(), source.steps()),
            ("task form is unreachable".into(), vec![])
        );
    }

    #[tokio::test]
    async fn a_scrape_failure_is_reported_and_skips_the_return_navigation() {
        let source = FakeTaskForm::failing_at(FailAt::Dates);
        let cache = ProjectOptionsCache::new();

        let error = TaskParametersScrape::run(&source, &cache)
            .await
            .unwrap_err();

        // Leaving the browser on the task form is deliberate: the command
        // failed, and the next call navigates there anyway.
        assert_eq!(
            (error.to_string(), source.steps()),
            ("date select is missing".into(), vec![Step::GotoTaskForm])
        );
    }

    #[tokio::test]
    async fn a_failed_project_scrape_caches_nothing_and_the_next_call_succeeds() {
        let failing = FakeTaskForm::failing_at(FailAt::Projects);
        let cache = ProjectOptionsCache::new();

        let error = TaskParametersScrape::run(&failing, &cache)
            .await
            .unwrap_err();
        let working = FakeTaskForm::default();
        let retried = TaskParametersScrape::run(&working, &cache).await.unwrap();

        assert_eq!(
            (error.to_string(), retried.projects),
            ("project select is missing".into(), options("project", 1))
        );
    }

    #[tokio::test]
    async fn a_cleared_cache_rescrapes_projects_so_a_new_login_sees_its_own() {
        let source = FakeTaskForm::default();
        let cache = ProjectOptionsCache::new();
        TaskParametersScrape::run(&source, &cache).await.unwrap();

        // Stands in for `close_browsers`, the only thing that clears the cache.
        cache.clear().await;
        let after_clear = TaskParametersScrape::run(&source, &cache).await.unwrap();

        assert_eq!(
            (after_clear.projects, source.project_scrapes.get()),
            (options("project", 2), 2)
        );
    }
}
