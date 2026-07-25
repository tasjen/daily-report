/// One project/comment row pair sent by the frontend, which has already
/// bucketed selected tasks through the `project_map` preference.
#[derive(serde::Deserialize, Debug)]
pub(crate) struct TaskEntry {
    project: Option<String>,
    summary: String,
}

impl TaskEntry {
    pub(crate) fn project(&self) -> Option<&str> {
        self.project.as_deref()
    }

    pub(crate) fn summary(&self) -> &str {
        &self.summary
    }
}

pub(crate) struct SubmissionPreferences {
    default_project: Option<String>,
    project_list: Vec<String>,
}

impl SubmissionPreferences {
    pub(crate) fn new(default_project: Option<String>, project_list: Vec<String>) -> Self {
        Self {
            default_project,
            project_list,
        }
    }
}

#[derive(Debug)]
pub(crate) struct SubmissionPlan {
    rows: Vec<TaskEntry>,
    project_filter: Option<Vec<String>>,
}

/// Project/comment row pairs on the portal task form. More than this cannot be
/// submitted, and the frontend's `buildSubmission` already merges overflow into
/// the last row.
pub(crate) const MAX_ROWS: usize = 3;

impl SubmissionPlan {
    /// Applies the backend's form constraints before Chromium is touched: at
    /// least one row, at most `MAX_ROWS`, and row-one defaulting.
    ///
    /// Too many rows is a caller contract violation, not user error, so it
    /// fails loudly. Silently dropping the extras would ship a report missing
    /// part of the day's work with no signal that anything was lost.
    pub(crate) fn build(
        mut entries: Vec<TaskEntry>,
        preferences: SubmissionPreferences,
    ) -> Result<Self, crate::AppError> {
        if entries.len() > MAX_ROWS {
            return Err(format!(
                "Cannot submit {} rows: the portal task form has only {MAX_ROWS}",
                entries.len()
            )
            .into());
        }
        let SubmissionPreferences {
            default_project,
            mut project_list,
        } = preferences;
        if entries.is_empty() {
            entries.push(TaskEntry {
                project: None,
                summary: String::new(),
            });
        }
        let project_filter = if project_list.is_empty() {
            None
        } else {
            project_list.extend(default_project.iter().cloned());
            project_list.extend(
                entries
                    .iter()
                    .filter_map(|entry| entry.project.as_ref())
                    .cloned(),
            );
            Some(project_list)
        };
        if let Some(first) = entries.first_mut() {
            first.project = first.project.take().or(default_project);
        }
        Ok(Self {
            rows: entries,
            project_filter,
        })
    }

    pub(crate) fn rows(&self) -> &[TaskEntry] {
        &self.rows
    }

    pub(crate) fn project_filter(&self) -> Option<&[String]> {
        self.project_filter.as_deref()
    }
}

/// Backend automation flags read from the persisted preferences object.
pub(crate) struct SubmissionAutomation {
    auto_submit: bool,
    auto_close: bool,
}

impl SubmissionAutomation {
    pub(crate) fn new(auto_submit: bool, auto_close: bool) -> Self {
        Self {
            auto_submit,
            auto_close,
        }
    }

    pub(crate) fn from_preferences(preferences: Option<&serde_json::Value>) -> Self {
        let auto_submit = preferences
            .and_then(|value| value.get("auto_submit"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        let auto_close = preferences
            .and_then(|value| value.get("auto_close"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        Self::new(auto_submit, auto_close)
    }
}

/// Observable completion state of the submission workflow.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum SubmissionOutcome {
    Prepared,
    Submitted,
    SubmittedAndClosed,
}

/// Boundary between submission policy and the real portal page/browser.
#[allow(async_fn_in_trait)]
pub(crate) trait SubmissionPortal {
    async fn prepare(&mut self, date: &str, plan: &SubmissionPlan) -> Result<(), crate::AppError>;
    async fn submit(&mut self) -> Result<(), crate::AppError>;
    async fn confirm_submission(&mut self) -> Result<(), crate::AppError>;
    async fn close(&mut self);
}

/// Prepares every submission, then conditionally submits and closes according
/// to the stored automation policy.
pub(crate) struct SubmissionWorkflow;

impl SubmissionWorkflow {
    pub(crate) async fn execute<P: SubmissionPortal>(
        plan: &SubmissionPlan,
        automation: SubmissionAutomation,
        date: &str,
        portal: &mut P,
    ) -> Result<SubmissionOutcome, crate::AppError> {
        portal.prepare(date, plan).await?;
        if !automation.auto_submit {
            return Ok(SubmissionOutcome::Prepared);
        }
        portal.submit().await?;
        if !automation.auto_close {
            return Ok(SubmissionOutcome::Submitted);
        }
        portal.confirm_submission().await.map_err(|error| {
            log::warn!("auto-close skipped, submission not confirmed: {error}");
            crate::AppError::from(format!(
                "{error}\nThe portal didn't confirm the submission; leaving the browser open"
            ))
        })?;
        portal.close().await;
        Ok(SubmissionOutcome::SubmittedAndClosed)
    }
}

#[cfg(test)]
mod tests {
    use crate::AppError;

    use super::{
        SubmissionAutomation, SubmissionOutcome, SubmissionPlan, SubmissionPortal,
        SubmissionPreferences, SubmissionWorkflow, TaskEntry,
    };

    #[derive(Debug, Default, PartialEq, Eq)]
    enum PortalState {
        #[default]
        Empty,
        Prepared,
        Submitted,
        Confirmed,
        Closed,
        ClosedWithoutConfirmation,
    }

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum FailurePoint {
        Prepare,
        Submit,
        Confirm,
    }

    #[derive(Default)]
    struct FakePortal {
        state: PortalState,
        failure: Option<FailurePoint>,
    }

    impl FakePortal {
        fn failing_at(failure: FailurePoint) -> Self {
            Self {
                failure: Some(failure),
                ..Self::default()
            }
        }
    }

    impl SubmissionPortal for FakePortal {
        async fn prepare(&mut self, _date: &str, _plan: &SubmissionPlan) -> Result<(), AppError> {
            if self.failure == Some(FailurePoint::Prepare) {
                return Err("prepare failed".into());
            }
            self.state = PortalState::Prepared;
            Ok(())
        }

        async fn submit(&mut self) -> Result<(), AppError> {
            if self.failure == Some(FailurePoint::Submit) {
                return Err("submit failed".into());
            }
            self.state = PortalState::Submitted;
            Ok(())
        }

        async fn confirm_submission(&mut self) -> Result<(), AppError> {
            if self.failure == Some(FailurePoint::Confirm) {
                return Err("confirmation failed".into());
            }
            self.state = PortalState::Confirmed;
            Ok(())
        }

        async fn close(&mut self) {
            self.state = if self.state == PortalState::Confirmed {
                PortalState::Closed
            } else {
                PortalState::ClosedWithoutConfirmation
            };
        }
    }

    fn one_row_plan() -> SubmissionPlan {
        SubmissionPlan::build(
            vec![TaskEntry {
                project: Some("entry-project".into()),
                summary: "Finished the report".into(),
            }],
            SubmissionPreferences::new(None, vec![]),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn auto_submit_disabled_leaves_the_prepared_form_open() {
        let mut portal = FakePortal::default();

        let outcome = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::new(false, true),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap();

        assert_eq!(
            (outcome, portal.state),
            (SubmissionOutcome::Prepared, PortalState::Prepared)
        );
    }

    #[tokio::test]
    async fn auto_submit_enabled_submits_the_prepared_form_and_leaves_it_open() {
        let mut portal = FakePortal::default();

        let outcome = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::new(true, false),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap();

        assert_eq!(
            (outcome, portal.state),
            (SubmissionOutcome::Submitted, PortalState::Submitted)
        );
    }

    #[tokio::test]
    async fn auto_close_waits_for_confirmation_before_closing_the_browser() {
        let mut portal = FakePortal::default();

        let outcome = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::new(true, true),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap();

        assert_eq!(
            (outcome, portal.state),
            (SubmissionOutcome::SubmittedAndClosed, PortalState::Closed)
        );
    }

    #[tokio::test]
    async fn preparation_failure_prevents_submission() {
        let mut portal = FakePortal::failing_at(FailurePoint::Prepare);

        let error = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::new(true, true),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap_err();

        assert_eq!(
            (error.to_string(), portal.state),
            ("prepare failed".into(), PortalState::Empty)
        );
    }

    #[tokio::test]
    async fn submission_failure_leaves_the_prepared_form_open() {
        let mut portal = FakePortal::failing_at(FailurePoint::Submit);

        let error = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::new(true, true),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap_err();

        assert_eq!(
            (error.to_string(), portal.state),
            ("submit failed".into(), PortalState::Prepared)
        );
    }

    #[tokio::test]
    async fn unconfirmed_submission_returns_context_and_leaves_the_browser_open() {
        let mut portal = FakePortal::failing_at(FailurePoint::Confirm);

        let error = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::new(true, true),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap_err();

        assert_eq!(
            (error.to_string(), portal.state),
            (
                "confirmation failed\nThe portal didn't confirm the submission; leaving the browser open"
                    .into(),
                PortalState::Submitted,
            )
        );
    }

    #[tokio::test]
    async fn missing_automation_preferences_default_to_manual_submission() {
        let mut portal = FakePortal::default();

        let outcome = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::from_preferences(None),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap();

        assert_eq!(
            (outcome, portal.state),
            (SubmissionOutcome::Prepared, PortalState::Prepared)
        );
    }

    #[tokio::test]
    async fn stored_automation_preferences_enable_submit_and_close() {
        let preferences = serde_json::json!({
            "auto_submit": true,
            "auto_close": true,
        });
        let mut portal = FakePortal::default();

        let outcome = SubmissionWorkflow::execute(
            &one_row_plan(),
            SubmissionAutomation::from_preferences(Some(&preferences)),
            "2026-07-25",
            &mut portal,
        )
        .await
        .unwrap();

        assert_eq!(
            (outcome, portal.state),
            (SubmissionOutcome::SubmittedAndClosed, PortalState::Closed)
        );
    }

    #[test]
    fn missing_first_row_project_uses_the_configured_default() {
        let plan = SubmissionPlan::build(
            vec![TaskEntry {
                project: None,
                summary: "Finished the report".into(),
            }],
            SubmissionPreferences::new(Some("portal-project".into()), vec![]),
        )
        .unwrap();

        let row = &plan.rows()[0];
        assert_eq!(
            (row.project.as_deref(), row.summary.as_str()),
            (Some("portal-project"), "Finished the report")
        );
    }

    #[test]
    fn explicit_first_row_project_overrides_the_configured_default() {
        let plan = SubmissionPlan::build(
            vec![TaskEntry {
                project: Some("entry-project".into()),
                summary: "Finished the report".into(),
            }],
            SubmissionPreferences::new(Some("default-project".into()), vec![]),
        )
        .unwrap();

        assert_eq!(plan.rows()[0].project.as_deref(), Some("entry-project"));
    }

    #[test]
    fn valid_rows_keep_their_order_and_only_row_one_uses_the_default() {
        let plan = SubmissionPlan::build(
            vec![
                TaskEntry {
                    project: None,
                    summary: "First".into(),
                },
                TaskEntry {
                    project: None,
                    summary: "Second".into(),
                },
                TaskEntry {
                    project: Some("third-project".into()),
                    summary: "Third".into(),
                },
            ],
            SubmissionPreferences::new(Some("default-project".into()), vec![]),
        )
        .unwrap();

        let rows = plan
            .rows()
            .iter()
            .map(|row| (row.project.as_deref(), row.summary.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(
            rows,
            [
                (Some("default-project"), "First"),
                (None, "Second"),
                (Some("third-project"), "Third"),
            ]
        );
    }

    fn rows(summaries: &[&str]) -> Vec<TaskEntry> {
        summaries
            .iter()
            .map(|summary| TaskEntry {
                project: None,
                summary: (*summary).into(),
            })
            .collect()
    }

    #[test]
    fn more_rows_than_the_portal_form_holds_are_rejected_rather_than_dropped() {
        let error = SubmissionPlan::build(
            rows(&["First", "Second", "Third", "Fourth"]),
            SubmissionPreferences::new(None, vec![]),
        )
        .unwrap_err();

        assert_eq!(
            error.to_string(),
            "Cannot submit 4 rows: the portal task form has only 3"
        );
    }

    #[test]
    fn a_full_three_row_submission_is_accepted() {
        let plan = SubmissionPlan::build(
            rows(&["First", "Second", "Third"]),
            SubmissionPreferences::new(None, vec![]),
        )
        .unwrap();

        assert_eq!(
            plan.rows()
                .iter()
                .map(|row| row.summary.as_str())
                .collect::<Vec<_>>(),
            ["First", "Second", "Third"]
        );
    }

    #[test]
    fn empty_input_produces_one_blank_row() {
        let plan = SubmissionPlan::build(
            vec![],
            SubmissionPreferences::new(Some("default-project".into()), vec![]),
        )
        .unwrap();

        let row = &plan.rows()[0];
        assert_eq!(
            (row.project.as_deref(), row.summary.as_str()),
            (Some("default-project"), "")
        );
    }

    #[test]
    fn empty_project_list_disables_filtering() {
        let plan = SubmissionPlan::build(
            vec![TaskEntry {
                project: Some("entry-project".into()),
                summary: "Finished the report".into(),
            }],
            SubmissionPreferences::new(Some("default-project".into()), vec![]),
        )
        .unwrap();

        assert_eq!(plan.project_filter(), None);
    }

    #[test]
    fn configured_projects_define_the_filter() {
        let plan = SubmissionPlan::build(
            vec![TaskEntry {
                project: None,
                summary: "Finished the report".into(),
            }],
            SubmissionPreferences::new(None, vec!["first-project".into(), "second-project".into()]),
        )
        .unwrap();

        assert_eq!(
            plan.project_filter(),
            Some(["first-project".into(), "second-project".into()].as_slice())
        );
    }

    #[test]
    fn configured_default_project_survives_filtering() {
        let plan = SubmissionPlan::build(
            vec![TaskEntry {
                project: Some("entry-project".into()),
                summary: "Finished the report".into(),
            }],
            SubmissionPreferences::new(
                Some("default-project".into()),
                vec!["listed-project".into()],
            ),
        )
        .unwrap();

        assert!(plan
            .project_filter()
            .is_some_and(|projects| projects.iter().any(|project| project == "default-project")));
    }

    #[test]
    fn submitted_entry_projects_survive_filtering() {
        let plan = SubmissionPlan::build(
            vec![
                TaskEntry {
                    project: Some("first-entry-project".into()),
                    summary: "First".into(),
                },
                TaskEntry {
                    project: Some("second-entry-project".into()),
                    summary: "Second".into(),
                },
            ],
            SubmissionPreferences::new(
                Some("default-project".into()),
                vec!["listed-project".into()],
            ),
        )
        .unwrap();

        assert_eq!(
            plan.project_filter(),
            Some(
                [
                    "listed-project".into(),
                    "default-project".into(),
                    "first-entry-project".into(),
                    "second-entry-project".into(),
                ]
                .as_slice()
            )
        );
    }
}
