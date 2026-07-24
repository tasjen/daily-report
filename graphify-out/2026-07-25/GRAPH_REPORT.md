# Graph Report - daily-report  (2026-07-25)

## Corpus Check
- 149 files · ~109,547 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1135 nodes · 1327 edges · 209 communities (79 shown, 130 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 41 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `72a8aaec`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Rust Backend Browser Automation
- Frontend Component Tests
- Agent Workflow Skills
- PRD & Agent-Brief Authoring
- Issue-Tracker Wayfinding
- Research & Domain Modeling
- Deep Module Design Vocabulary
- Tauri Build Configuration
- oxfmt Formatter Config
- TypeScript App tsconfig
- Mutations & Queries
- package.json Scripts
- oxlint Linter Config
- Architecture Review Skill
- CI/CD & Release Pipeline
- shadcn components.json
- Vite/Vitest tsconfig
- React App Components
- Prototype & Logic Modules
- Combobox Component
- Account Verification Feature
- Auto-Submit/Close & Favorites
- Root tsconfig
- Tauri Capabilities Permissions
- Knip Config
- Field Component
- Date-Card Submission Helpers
- Claude Settings & Plugins
- Version Bump Script
- icon
- InputGroup
- lucide-react
- Theme
- Rust CI Job
- devDependencies
- Releasing (README)
- Locale
- Daily Report App
- step
- TextField
- Fluency Strength
- Graphify Codebase Navigation Workflow
- Props
- Button
- Props
- Props
- main.tsx
- type.ts
- files
- Sediment
- @babel/core
- babel-plugin-react-compiler
- @base-ui/react
- class-variance-authority
- clsx
- config
- @formkit/auto-animate
- install.sh
- jsdom
- lefthook
- @lingui/babel-plugin-lingui-macro
- @lingui/cli
- @lingui/core
- @lingui/react
- @lingui/vite-plugin
- mutative
- next-themes
- oxfmt
- oxlint
- oxlint-tsgolint
- react-dom
- react-error-boundary
- shadcn
- sonner
- tailwind-merge
- tailwindcss
- @tanstack/react-form
- @tanstack/react-query
- @tanstack/react-query-devtools
- @tauri-apps/api
- @tauri-apps/plugin-http
- @tauri-apps/plugin-process
- @tauri-apps/plugin-updater
- @tauri-apps/plugin-window-state
- tw-animate-css
- zod
- knip
- @rolldown/plugin-babel
- @tauri-apps/cli
- @testing-library/user-event
- @types/node
- @types/react
- @types/react-dom
- typescript
- vite
- @vitejs/plugin-react
- vitest
- @wdio/cli
- @wdio/globals
- @wdio/local-runner
- @wdio/mocha-framework
- @wdio/spec-reporter
- TASK_GROUPS
- *.po
- Tauri Logo
- Vite Logo
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Blue-Cyan House Launcher Icon
- Gradient House Monogram
- Round Blue-Cyan House Launcher Icon
- Blue-Cyan House Launcher Icon
- Gradient House Monogram
- Round Blue-Cyan House Launcher Icon
- Blue-Cyan House Launcher Icon
- Gradient House Monogram
- Round Blue-Cyan House Launcher Icon
- Blue-Cyan House Launcher Icon
- Gradient House Monogram
- Round Blue-Cyan House Launcher Icon
- Daily Report Android Launcher Icon
- Daily Report Android Launcher Foreground
- Round Daily Report Android Launcher Icon
- Tauri Logo
- Tauri Logo
- Tauri Logo
- Two-Tone Interlocking Circular Emblem
- Tauri Logo
- Tauri Logo
- Two-Tone Interlocking Circular Emblem
- Two-Tone Interlocking Circular Emblem
- Two-Tone Interlocking Circular Emblem
- Two-Tone Interlocking Circular Emblem
- Two-Tone Interlocking Circular Emblem
- Two-Tone Interlocking Circular Emblem
- Two-Tone Interlocking Circular Emblem
- Two-Tone Interlocking Circular Emblem
- Daily Report App Icon
- Daily Report iOS App Icon 20pt 1x
- Daily Report iOS App Icon 20pt 2x Varian
- Daily Report iOS App Icon 20pt 2x
- Daily Report iOS App Icon 20pt 3x
- Daily Report iOS App Icon 29pt 1x
- Daily Report iOS App Icon 29pt 2x Varian
- Daily Report iOS App Icon 29pt 2x
- Daily Report iOS App Icon 29pt 3x
- Daily Report iOS App Icon 40pt 1x
- Daily Report iOS App Icon 40pt 2x Varian
- Daily Report iOS App Icon 40pt 2x
- Daily Report iOS App Icon 40pt 3x
- Daily Report iOS App Store Icon 512pt 2x
- Daily Report iOS App Icon 60pt 2x
- Daily Report iOS App Icon 60pt 3x
- Daily Report iPad App Icon 76pt 1x
- Daily Report iPad App Icon 76pt 2x
- Daily Report iPad Pro App Icon 83.5pt 2x
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Daily Report App Icon
- Interface as Test Surface
- Engineering Skills Configuration
- Tracer Bullet Issues
- Design It Twice
- Depth
- lucide-react
- @tailwindcss/vite
- @tauri-apps/plugin-opener
- @testing-library/dom
- @testing-library/jest-dom
- @types/babel__core

## God Nodes (most connected - your core abstractions)
1. `AppError` - 26 edges
2. `react` - 25 edges
3. `compilerOptions` - 23 edges
4. `scripts` - 18 edges
5. `compilerOptions` - 16 edges
6. `BrowserState` - 15 edges
7. `submit_task()` - 15 edges
8. `portal_url()` - 12 edges
9. `vitest` - 11 edges
10. `get_task_parameters()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Shared Portal Login Helper` --semantically_similar_to--> `Single Source of Truth`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-07-12-account-verification-design.md → .agents/skills/writing-great-skills/GLOSSARY.md
- `Pre-commit Hooks (lint/fmt/rustfmt)` --semantically_similar_to--> `Frontend CI Job`  [INFERRED] [semantically similar]
  lefthook.yaml → .github/workflows/ci.yml
- `Pre-push Hooks (tsc/clippy)` --semantically_similar_to--> `Rust CI Job`  [INFERRED] [semantically similar]
  lefthook.yaml → .github/workflows/ci.yml
- `Releasing (README)` --semantically_similar_to--> `Release Process (pnpm bump)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Before-and-after Diagram` --semantically_similar_to--> `Design Comparison`  [INFERRED] [semantically similar]
  .agents/skills/improve-codebase-architecture/HTML-REPORT.md → .agents/skills/codebase-design/DESIGN-IT-TWICE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **CI/CD Pipeline Jobs** — github_workflows_ci_frontend, github_workflows_ci_rust, github_workflows_e2e_e2e [INFERRED 0.85]
- **Release Flow** — github_workflows_release_guard, github_workflows_release_build, claude_release_process, claude_updater [INFERRED 0.85]
- **Graphify Navigation Workflow** — claude_graphify_workflow, readme_graphify_navigation, graphify_out_memory_query_20260720_161901_update_the_readme_md_file_about_graphify_usage_query [INFERRED 0.85]
- **Deep Module Vocabulary** — agents_skills_codebase_design_skill_module, agents_skills_codebase_design_skill_interface, agents_skills_codebase_design_skill_depth, agents_skills_codebase_design_skill_seam, agents_skills_codebase_design_skill_adapter, agents_skills_codebase_design_skill_leverage, agents_skills_codebase_design_skill_locality [EXTRACTED 1.00]
- **Hard Bug Diagnosis Loop** — agents_skills_diagnosing_bugs_skill_tight_feedback_loop, agents_skills_diagnosing_bugs_skill_reproduce_and_minimise, agents_skills_diagnosing_bugs_skill_ranked_falsifiable_hypotheses, agents_skills_diagnosing_bugs_skill_prediction_driven_instrumentation, agents_skills_diagnosing_bugs_skill_regression_test_at_correct_seam, agents_skills_diagnosing_bugs_skill_cleanup_and_architecture_post_mortem [EXTRACTED 1.00]
- **Supported Issue Tracker Implementations** — _agents_skills_setup_matt_pocock_skills_issue_tracker_github_github_issue_tracker, _agents_skills_setup_matt_pocock_skills_issue_tracker_gitlab_gitlab_issue_tracker, _agents_skills_setup_matt_pocock_skills_issue_tracker_local_local_markdown_issue_tracker [EXTRACTED 1.00]
- **Portable Logic Prototype Module Shapes** — _agents_skills_prototype_logic_pure_reducer, _agents_skills_prototype_logic_state_machine, _agents_skills_prototype_logic_pure_function_set, _agents_skills_prototype_logic_stateful_module_interface [EXTRACTED 1.00]
- **Knowledge Skills and Wisdom Learning Model** — _agents_skills_teach_resources_format_high_trust_resources, _agents_skills_teach_skill_self_contained_html_lesson, _agents_skills_teach_skill_community_wisdom [EXTRACTED 1.00]
- **Auto-Fill, Auto-Submit, and Auto-Close Dependency Chain** — docs_superpowers_specs_2026_07_08_auto_submit_auto_close_design_auto_submit, docs_superpowers_specs_2026_07_08_auto_submit_auto_close_design_auto_close, docs_superpowers_specs_2026_07_08_auto_submit_auto_close_design_cascade_rule [EXTRACTED 1.00]
- **Parallel Portal and Jira Account Verification Flow** — docs_superpowers_specs_2026_07_12_account_verification_design_candidate_portal_verification, docs_superpowers_specs_2026_07_12_account_verification_design_jira_credentials_check, docs_superpowers_specs_2026_07_12_account_verification_design_parallel_account_verification, docs_superpowers_specs_2026_07_12_account_verification_design_verify_account_error, docs_superpowers_specs_2026_07_12_account_verification_design_save_anyway_escape_hatch [EXTRACTED 1.00]
- **Signed Release and Update Delivery Chain** — docs_superpowers_specs_2026_07_12_cicd_design_tag_driven_release_pipeline, docs_superpowers_specs_2026_07_12_cicd_design_release_version_guard, docs_superpowers_specs_2026_07_12_cicd_design_updater_signing_key, docs_superpowers_specs_2026_07_12_cicd_design_draft_release_publish_gate, docs_superpowers_specs_2026_07_12_cicd_design_in_app_auto_updater [EXTRACTED 1.00]

## Communities (209 total, 130 thin omitted)

### Community 0 - "Rust Backend Browser Automation"
Cohesion: 0.14
Nodes (42): AppHandle, Box, Browser, CdpError, Error, From, Mutex, Ok (+34 more)

### Community 1 - "Frontend Component Tests"
Cohesion: 0.05
Nodes (19): vitest, fillField(), fillValidFields(), PortalBehavior, saveButton(), submit(), ACCOUNT, CREATED_ISSUES (+11 more)

### Community 2 - "Agent Workflow Skills"
Cohesion: 0.14
Nodes (16): Architecture Health Loop, Ask Matt, Context Hygiene, Idea-to-Ship Main Flow, Multi-session Issue Flow, Prototype Detour, Grill Me, Grill With Docs (+8 more)

### Community 3 - "PRD & Agent-Brief Authoring"
Cohesion: 0.06
Nodes (40): PRD Template, Ready-for-Agent PRD Publication, Highest-Level Test Seam Selection, To-PRD Skill, Agent Brief, Behavioral, Not Procedural Contract, Complete Acceptance Criteria, Durability over Precision (+32 more)

### Community 4 - "Issue-Tracker Wayfinding"
Cohesion: 0.20
Nodes (12): External Pull Request Triage, GitHub Issue Tracker, GitHub Wayfinding Operations, Shared GitHub Issue and PR Number Space, External Merge Request Triage, GitLab Issue Tracker, Separate GitLab Issue and MR Number Spaces, Local Markdown Issue Tracker (+4 more)

### Community 5 - "Research & Domain Modeling"
Cohesion: 0.07
Nodes (33): Background Research Agent, Cited Markdown Findings, Primary-Source Research, Research Skill, Glossary Vocabulary Discipline, Canonical Learning Language, Evidence-Gated Term Promotion, Glossary Ambiguity Resolution (+25 more)

### Community 6 - "Deep Module Design Vocabulary"
Cohesion: 0.20
Nodes (10): Dependency Classification, In-process Dependency, Local-substitutable Dependency, Remote but Owned Dependency, True External Dependency, Architecture HTML Report, Before-and-after Diagram, Deepening Candidate Card (+2 more)

### Community 7 - "Tauri Build Configuration"
Cohesion: 0.06
Nodes (33): https://github.com/tasjen/daily-report/releases/latest/download/latest.json, icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security (+25 more)

### Community 8 - "oxfmt Formatter Config"
Cohesion: 0.07
Nodes (27): arrowParens, bracketSameLine, bracketSpacing, ignorePatterns, graphify-out, src-tauri/gen, src-tauri/target, jsxSingleQuote (+19 more)

### Community 9 - "TypeScript App tsconfig"
Cohesion: 0.07
Nodes (29): DOM, DOM.Iterable, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+21 more)

### Community 10 - "Mutations & Queries"
Cohesion: 0.13
Nodes (24): SubmitTaskEntry, useSaveAccountMutation(), useSaveFavoritesMutation(), useSavePreferencesMutation(), useSubmitTaskMutation(), useVerifyAccountMutation(), VerifyAccountError, accountOptions() (+16 more)

### Community 11 - "package.json Scripts"
Cohesion: 0.08
Nodes (23): name, packageManager, private, scripts, build, bump, clean, dev (+15 more)

### Community 12 - "oxlint Linter Config"
Cohesion: 0.09
Nodes (22): categories, correctness, suspicious, ignorePatterns, graphify-out, src-tauri/gen, src-tauri/target, options (+14 more)

### Community 13 - "Architecture Review Skill"
Cohesion: 0.18
Nodes (13): Dependency Injection, Internal Collaborator Mocking, SDK-Style Boundary Interface, System-Boundary Mocking, Behavior Through Public Interfaces, Horizontal Slicing, Implementation-Coupled Test, Tautological Test (+5 more)

### Community 14 - "CI/CD & Release Pipeline"
Cohesion: 0.13
Nodes (22): Weekly Cargo Updates, Dependabot Configuration, Weekly GitHub Actions Updates, Weekly npm Updates, CI/CD Implementation Plan, CI/CD Design, Continuous Integration Checks, curl-Based macOS Installer (+14 more)

### Community 15 - "shadcn components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 16 - "Vite/Vitest tsconfig"
Cohesion: 0.09
Nodes (21): vite.config.ts, vitest.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+13 more)

### Community 18 - "Prototype & Logic Modules"
Cohesion: 0.10
Nodes (23): Explicit Prototype Question, In-Memory Prototype State, Lightweight TUI, Logic Prototype, Portable Pure Logic Module, Pure Function Set, Pure Reducer, State Machine (+15 more)

### Community 19 - "Combobox Component"
Cohesion: 0.11
Nodes (3): react, react, useComboboxAnchor()

### Community 20 - "Account Verification Feature"
Cohesion: 0.20
Nodes (17): Account Verification Implementation Plan, Account Portal URL and Credential Fields, Browser Session Reset on Account Save, Custom Portal Credentials Design, Fail-Fast Portal Configuration Read, No Compiled-In Portal Defaults, Portal Store-Reading Helpers, Account Verification Design (+9 more)

### Community 21 - "Auto-Submit/Close & Favorites"
Cohesion: 0.24
Nodes (16): Auto-Submit and Auto-Close Implementation Plan, Favorites Implementation Plan, Auto-Close Preference, Auto-Submit Preference, Auto-Submit and Auto-Close Design, Backend Automatic Submission Flow, Auto-Fill to Auto-Submit to Auto-Close Cascade Rule, Auto-Submit Preference Schema (+8 more)

### Community 23 - "Root tsconfig"
Cohesion: 0.13
Nodes (14): compilerOptions, module, moduleResolution, noEmit, skipLibCheck, strict, target, types (+6 more)

### Community 24 - "Tauri Capabilities Permissions"
Cohesion: 0.13
Nodes (14): core:default, core:window:allow-set-background-color, core:window:allow-set-focus, core:window:allow-show, main, opener:default, process:allow-restart, store:default (+6 more)

### Community 25 - "Knip Config"
Cohesion: 0.15
Nodes (12): ignoreBinaries, ignoreDependencies, $schema, tags, webdriver-io, config, entry, e2e/*.e2e.ts (+4 more)

### Community 27 - "Date-Card Submission Helpers"
Cohesion: 0.21
Nodes (7): Bucket, bucketSize(), buildSubmission(), buildSummary(), bulletLines(), IssueGroup, SubmissionInput

### Community 28 - "Claude Settings & Plugins"
Cohesion: 0.18
Nodes (10): enabledPlugins, andrej-karpathy-skills@karpathy-skills, frontend-design@claude-plugins-official, superpowers@claude-plugins-official, hooks, PreToolUse, permissions, allow (+2 more)

### Community 29 - "Version Bump Script"
Cohesion: 0.45
Nodes (10): args, bump(), compareVersions(), fail(), git(), readVersion(), replaceVersionLine(), requireReleasableState() (+2 more)

### Community 31 - "icon"
Cohesion: 0.18
Nodes (10): icons-dev/128x128@2x.png, icons-dev/128x128.png, icons-dev/32x32.png, icons-dev/icon.icns, icons-dev/icon.ico, bundle, icon, identifier (+2 more)

### Community 33 - "InputGroup"
Cohesion: 0.28
Nodes (4): InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants

### Community 34 - "lucide-react"
Cohesion: 0.22
Nodes (9): @base-ui/react, dependencies, @base-ui/react, @tauri-apps/plugin-process, @tauri-apps/plugin-store, zod, @tauri-apps/plugin-process, @tauri-apps/plugin-store (+1 more)

### Community 36 - "Theme"
Cohesion: 0.25
Nodes (5): initialState, Theme, ThemeProviderContext, ThemeProviderProps, ThemeProviderState

### Community 37 - "Rust CI Job"
Cohesion: 0.33
Nodes (7): CI/CD Pipeline, Frontend CI Job, CI paths-filter change detection, Rust CI Job, E2E Smoke Test Job, Pre-commit Hooks (lint/fmt/rustfmt), Pre-push Hooks (tsc/clippy)

### Community 38 - "devDependencies"
Cohesion: 0.22
Nodes (9): oxlint, devDependencies, oxlint, @testing-library/react, @types/react-dom, @vitejs/plugin-react, @testing-library/react, @types/react-dom (+1 more)

### Community 39 - "Releasing (README)"
Cohesion: 0.47
Nodes (6): Release Process (pnpm bump), Updater Mechanism (tauri-plugin-updater), Release Build Job (tauri-action), Release Version Guard Job, Install Instructions, Releasing (README)

### Community 42 - "Daily Report App"
Cohesion: 0.50
Nodes (4): Repository Guidance (AGENTS.md), Two Browser Instances (BrowserState), Daily Report App, App Root Mount Point (index.html)

### Community 43 - "step"
Cohesion: 0.83
Nodes (3): capture(), hitl-loop.template.sh script, step()

### Community 45 - "Fluency Strength"
Cohesion: 0.67
Nodes (3): Desirable Difficulty, Fluency Strength, Storage Strength

### Community 46 - "Graphify Codebase Navigation Workflow"
Cohesion: 1.00
Nodes (3): Graphify Codebase Navigation Workflow, Query: Update README about Graphify usage, Codebase Navigation with Graphify (README)

### Community 58 - "@base-ui/react"
Cohesion: 0.24
Nodes (16): configured_default_project_survives_filtering(), configured_projects_define_the_filter(), empty_input_produces_one_blank_row(), empty_project_list_disables_filtering(), explicit_first_row_project_overrides_the_configured_default(), malformed_input_is_limited_to_the_portals_three_rows(), missing_first_row_project_uses_the_configured_default(), Option (+8 more)

### Community 74 - "oxlint"
Cohesion: 0.15
Nodes (15): ADR Eligibility Test, ADR Format, Minimal ADR, Canonical Domain Language, CONTEXT.md Format, Multi-context Map, Single-context Layout, Code-model Cross-check (+7 more)

### Community 87 - "@tauri-apps/plugin-process"
Cohesion: 0.18
Nodes (12): Triage and Diagnosis On-ramps, Code Review, Fixed-point Diff, Fowler Smell Baseline, Separate Axis Reporting, Spec Axis, Spec Source Discovery, Standards Axis (+4 more)

### Community 91 - "zod"
Cohesion: 0.20
Nodes (10): needs-info, needs-triage, ready-for-agent, ready-for-human, Triage Label Mapping, wontfix, AFK-Ready Issues, Dependency-Ordered Issue Publication (+2 more)

### Community 98 - "@types/react-dom"
Cohesion: 0.25
Nodes (9): ADR-Aware Architecture Review, Architecture Review HTML Report, Deep Module Design Vocabulary, Deepening Opportunity, Deletion Test, Improve Codebase Architecture, ADR Conflict Flagging, Pre-Agreed Test Seams (+1 more)

### Community 101 - "@vitejs/plugin-react"
Cohesion: 0.47
Nodes (9): Deepening, Ports and Adapters, Adapter, Codebase Design, Implementation, Interface, Module, Real Seam Requires Two Adapters (+1 more)

### Community 198 - "Interface as Test Surface"
Cohesion: 0.22
Nodes (9): Replace-don't-layer Testing, Interface as Test Surface, Cleanup and Architecture Post-mortem, Performance Measurement Branch, Prediction-driven Instrumentation, Ranked Falsifiable Hypotheses, Regression Test at Correct Seam, Reproduce and Minimise (+1 more)

### Community 199 - "Engineering Skills Configuration"
Cohesion: 0.25
Nodes (8): Domain Docs, Multi-Context Domain Layout, Single-Context Domain Layout, Agent Skills Configuration Block, Domain Docs Layout Decision, Engineering Skills Configuration, Prompt-Driven Setup, Triage Label Vocabulary

### Community 200 - "Tracer Bullet Issues"
Cohesion: 0.25
Nodes (8): Setup Matt Pocock Skills, Red-Green Loop, Vertical Slice TDD, Issue Breakdown Quiz, Prefactoring, To Issues, Tracer Bullet Issues, Vertical Slice Rules

### Community 201 - "Design It Twice"
Cohesion: 0.40
Nodes (5): Common-caller Constraint, Design It Twice, Minimal Interface Constraint, Parallel Interface Alternatives, Problem-space Framing

### Community 202 - "Depth"
Cohesion: 0.50
Nodes (5): Design Comparison, Deletion Test, Depth, Leverage, Locality

## Knowledge Gaps
- **419 isolated node(s):** `$schema`, `mcp__claude_ai_Figma__get_design_context`, `superpowers@claude-plugins-official`, `frontend-design@claude-plugins-official`, `andrej-karpathy-skills@karpathy-skills` (+414 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **130 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `React App Components` to `select.tsx`, `InputGroup`, `Card`, `Theme`, `oxlint Linter Config`, `TextField`, `Props`, `OpenMemberPageButton`, `Combobox Component`, `ProjectListSelect`, `Dropdown Menu Component`, `Props`, `main.tsx`, `Field Component`, `Dialog`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Why does `dependencies` connect `lucide-react` to `@tauri-apps/plugin-opener`, `package.json Scripts`, `Combobox Component`, `class-variance-authority`, `clsx`, `@formkit/auto-animate`, `@lingui/core`, `@lingui/react`, `mutative`, `next-themes`, `lucide-react`, `react-dom`, `react-error-boundary`, `shadcn`, `sonner`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`, `@tanstack/react-form`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `@tauri-apps/api`, `@tauri-apps/plugin-http`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-window-state`, `tw-animate-css`?**
  _High betweenness centrality (0.071) - this node is a cross-community bridge._
- **Why does `react` connect `Combobox Component` to `lucide-react`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `$schema`, `mcp__claude_ai_Figma__get_design_context`, `superpowers@claude-plugins-official` to the rest of the system?**
  _419 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Rust Backend Browser Automation` be split into smaller, more focused modules?**
  _Cohesion score 0.1378809869375907 - nodes in this community are weakly interconnected._
- **Should `Frontend Component Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.045068027210884355 - nodes in this community are weakly interconnected._
- **Should `Agent Workflow Skills` be split into smaller, more focused modules?**
  _Cohesion score 0.14166666666666666 - nodes in this community are weakly interconnected._