/// One project/comment row pair sent by the frontend, which has already
/// bucketed selected tasks through the `project_map` preference.
#[derive(serde::Deserialize)]
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

pub(crate) struct SubmissionPlan {
    rows: Vec<TaskEntry>,
    project_filter: Option<Vec<String>>,
}

impl SubmissionPlan {
    /// Applies the backend's defensive form constraints before Chromium is
    /// touched: at most three rows, at least one row, and row-one defaulting.
    pub(crate) fn build(mut entries: Vec<TaskEntry>, preferences: SubmissionPreferences) -> Self {
        let SubmissionPreferences {
            default_project,
            mut project_list,
        } = preferences;
        entries.truncate(3);
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
        Self {
            rows: entries,
            project_filter,
        }
    }

    pub(crate) fn rows(&self) -> &[TaskEntry] {
        &self.rows
    }

    pub(crate) fn project_filter(&self) -> Option<&[String]> {
        self.project_filter.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::{SubmissionPlan, SubmissionPreferences, TaskEntry};

    #[test]
    fn missing_first_row_project_uses_the_configured_default() {
        let plan = SubmissionPlan::build(
            vec![TaskEntry {
                project: None,
                summary: "Finished the report".into(),
            }],
            SubmissionPreferences::new(Some("portal-project".into()), vec![]),
        );

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
        );

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
        );

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

    #[test]
    fn malformed_input_is_limited_to_the_portals_three_rows() {
        let plan = SubmissionPlan::build(
            ["First", "Second", "Third", "Fourth"]
                .into_iter()
                .map(|summary| TaskEntry {
                    project: None,
                    summary: summary.into(),
                })
                .collect(),
            SubmissionPreferences::new(None, vec![]),
        );

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
        );

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
        );

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
        );

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
        );

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
        );

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
