# Graph Report - daily-report  (2026-07-21)

## Corpus Check
- 125 files · ~102,592 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 997 nodes · 1147 edges · 170 communities (73 shown, 97 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f50cdb17`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Portal Browser Backend
- Test Design Principles
- Frontend Build Toolchain
- Engineering Workflow Skills
- Biome Code Quality Rules
- Skill Contracts and Triage
- Deep Module Design
- CI and Release Automation
- Repository Architecture Guides
- Research and Teaching Skills
- Tauri Packaging and Updates
- Frontend TypeScript Configuration
- React Query Data Layer
- Prototype Design Methods
- UI Component Registry Config
- Build Tool TypeScript Config
- Combobox UI Components
- Account Verification Design
- Submission Automation and Favorites
- Tauri Capability Permissions
- Issue Tracker Integrations
- Form Field Components
- Claude Plugin Settings
- Version Release Script
- Development Bundle Branding
- Input Group Components
- Theme State Provider
- Persistent Settings Store
- Daily Report Date Cards
- Git Hook Quality Gates
- Account Settings Form
- Interactive Bug Diagnosis Loop
- Dead Code Analysis Config
- Learning Retention Techniques
- Frontend HTML Entrypoint
- Button UI Component
- Task Selection Component
- React Application Bootstrap
- Shared Application Types
- TypeScript Project References
- Skill Content Pruning
- Workflow
- React
- Class Name Utility
- Automatic UI Animation
- macOS Installer Script
- Interface Icon Library
- Immutable State Updates
- Application Theme Library
- React DOM Rendering
- React Error Boundaries
- Shadcn Component Toolkit
- Sonner Toast Notifications
- Tailwind Class Merging
- Tailwind Styling Framework
- Tailwind Vite Integration
- TanStack Form Library
- TanStack Query Cache
- React Query Devtools
- Tauri Frontend API
- Core Runtime Dependencies
- Desktop Process Control
- Desktop Update Plugin
- Window State Persistence
- Tailwind Animation Utilities
- Runtime Schema Validation
- Available Task Groups
- Tauri Brand Logo
- Vite Brand Logo
- Retina App Icon
- Standard App Icon
- Small App Icon
- Medium App Icon
- Android Launcher Icon
- Android Foreground Monogram
- HDPI Round Launcher Icon
- MDPI Launcher Icon
- MDPI Launcher Foreground
- MDPI Round Launcher Icon
- XHDPI Launcher Icon
- XHDPI Launcher Foreground
- XHDPI Round Launcher Icon
- XXHDPI Launcher Icon
- XXHDPI Launcher Foreground
- XXHDPI Round Launcher Icon
- XXXHDPI Launcher Icon
- XXXHDPI Launcher Foreground
- XXXHDPI Round Launcher Icon
- 256px Tauri Development Icon
- 128px Tauri Development Icon
- 32px Tauri Development Icon
- 512px Tauri Development Icon
- 107px Tauri Windows Tile
- 142px Tauri Windows Tile
- 150px Tauri Windows Tile
- 284px Tauri Windows Tile
- 30px Tauri Windows Tile
- 310px Tauri Windows Tile
- 44px Tauri Windows Tile
- 71px Tauri Windows Tile
- 89px Tauri Windows Tile
- Tauri Development Store Logo
- 512px Daily Report Icon
- 20pt iOS Icon 1x
- 20pt iOS Icon 2x Variant
- 20pt iOS Icon 2x
- 20pt iOS Icon 3x
- 29pt iOS Icon 1x
- 29pt iOS Icon 2x Variant
- 29pt iOS Icon 2x
- 29pt iOS Icon 3x
- 40pt iOS Icon 1x
- 40pt iOS Icon 2x Variant
- 40pt iOS Icon 2x
- 40pt iOS Icon 3x
- 1024px iOS Store Icon
- 60pt iOS Icon 2x
- 60pt iOS Icon 3x
- 76pt iPad Icon 1x
- 76pt iPad Icon 2x
- 83.5pt iPad Pro Icon 2x
- 107px Daily Report Tile
- 142px Daily Report Tile
- 150px Daily Report Tile
- 284px Daily Report Tile
- 30px Daily Report Tile
- 310px Daily Report Tile
- 44px Daily Report Tile
- 71px Daily Report Tile
- 89px Daily Report Tile
- Daily Report Store Logo
- @tauri-apps/plugin-opener
- @tauri-apps/plugin-store

## God Nodes (most connected - your core abstractions)
1. `AppError` - 26 edges
2. `compilerOptions` - 23 edges
3. `compilerOptions` - 16 edges
4. `BrowserState` - 15 edges
5. `submit_task()` - 15 edges
6. `portal_url()` - 11 edges
7. `get_task_parameters()` - 11 edges
8. `scripts` - 10 edges
9. `launch_browser()` - 10 edges
10. `login_to_portal()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `Shared Portal Login Helper` --semantically_similar_to--> `Single Source of Truth`  [INFERRED] [semantically similar]
  docs/superpowers/specs/2026-07-12-account-verification-design.md → .agents/skills/writing-great-skills/GLOSSARY.md
- `Daily Report Application` --semantically_similar_to--> `Daily Report`  [INFERRED] [semantically similar]
  README.md → AGENTS.md
- `Daily Report` --semantically_similar_to--> `Daily Report`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `Two Browser Instances` --semantically_similar_to--> `Two Browser Instances`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md
- `Live Session Probe` --semantically_similar_to--> `Live Session Probe`  [INFERRED] [semantically similar]
  AGENTS.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Parallel Frontend and Rust Quality Gates** — github_workflows_ci_ci_workflow, github_workflows_ci_frontend_job, github_workflows_ci_rust_job [EXTRACTED 1.00]
- **Cross-Platform Signed Draft Release** — github_workflows_release_cross_platform_build, github_workflows_release_macos_artifacts, github_workflows_release_windows_artifacts, github_workflows_release_signed_draft_release [EXTRACTED 1.00]
- **Daily Report Submission Flow** — agents_jira_integration, agents_task_selection_and_routing, agents_tauri_command_boundary, agents_browser_automation_architecture [EXTRACTED 1.00]
- **Deep Module Vocabulary** — agents_skills_codebase_design_skill_module, agents_skills_codebase_design_skill_interface, agents_skills_codebase_design_skill_depth, agents_skills_codebase_design_skill_seam, agents_skills_codebase_design_skill_adapter, agents_skills_codebase_design_skill_leverage, agents_skills_codebase_design_skill_locality [EXTRACTED 1.00]
- **Hard Bug Diagnosis Loop** — agents_skills_diagnosing_bugs_skill_tight_feedback_loop, agents_skills_diagnosing_bugs_skill_reproduce_and_minimise, agents_skills_diagnosing_bugs_skill_ranked_falsifiable_hypotheses, agents_skills_diagnosing_bugs_skill_prediction_driven_instrumentation, agents_skills_diagnosing_bugs_skill_regression_test_at_correct_seam, agents_skills_diagnosing_bugs_skill_cleanup_and_architecture_post_mortem [EXTRACTED 1.00]
- **Supported Issue Tracker Implementations** — _agents_skills_setup_matt_pocock_skills_issue_tracker_github_github_issue_tracker, _agents_skills_setup_matt_pocock_skills_issue_tracker_gitlab_gitlab_issue_tracker, _agents_skills_setup_matt_pocock_skills_issue_tracker_local_local_markdown_issue_tracker [EXTRACTED 1.00]
- **Portable Logic Prototype Module Shapes** — _agents_skills_prototype_logic_pure_reducer, _agents_skills_prototype_logic_state_machine, _agents_skills_prototype_logic_pure_function_set, _agents_skills_prototype_logic_stateful_module_interface [EXTRACTED 1.00]
- **Knowledge Skills and Wisdom Learning Model** — _agents_skills_teach_resources_format_high_trust_resources, _agents_skills_teach_skill_self_contained_html_lesson, _agents_skills_teach_skill_community_wisdom [EXTRACTED 1.00]
- **Auto-Fill, Auto-Submit, and Auto-Close Dependency Chain** — docs_superpowers_specs_2026_07_08_auto_submit_auto_close_design_auto_submit, docs_superpowers_specs_2026_07_08_auto_submit_auto_close_design_auto_close, docs_superpowers_specs_2026_07_08_auto_submit_auto_close_design_cascade_rule [EXTRACTED 1.00]
- **Parallel Portal and Jira Account Verification Flow** — docs_superpowers_specs_2026_07_12_account_verification_design_candidate_portal_verification, docs_superpowers_specs_2026_07_12_account_verification_design_jira_credentials_check, docs_superpowers_specs_2026_07_12_account_verification_design_parallel_account_verification, docs_superpowers_specs_2026_07_12_account_verification_design_verify_account_error, docs_superpowers_specs_2026_07_12_account_verification_design_save_anyway_escape_hatch [EXTRACTED 1.00]
- **Signed Release and Update Delivery Chain** — docs_superpowers_specs_2026_07_12_cicd_design_tag_driven_release_pipeline, docs_superpowers_specs_2026_07_12_cicd_design_release_version_guard, docs_superpowers_specs_2026_07_12_cicd_design_updater_signing_key, docs_superpowers_specs_2026_07_12_cicd_design_draft_release_publish_gate, docs_superpowers_specs_2026_07_12_cicd_design_in_app_auto_updater [EXTRACTED 1.00]

## Communities (170 total, 97 thin omitted)

### Community 0 - "Portal Browser Backend"
Cohesion: 0.14
Nodes (42): AppHandle, Box, Browser, CdpError, Error, From, Mutex, Ok (+34 more)

### Community 1 - "Test Design Principles"
Cohesion: 0.07
Nodes (31): ADR-Aware Architecture Review, Architecture Review HTML Report, Deep Module Design Vocabulary, Deepening Opportunity, Deletion Test, Improve Codebase Architecture, ADR Conflict Flagging, Domain Docs (+23 more)

### Community 2 - "Frontend Build Toolchain"
Cohesion: 0.04
Nodes (44): @babel/core, babel-plugin-react-compiler, @biomejs/biome, lefthook, devDependencies, @babel/core, babel-plugin-react-compiler, @biomejs/biome (+36 more)

### Community 3 - "Engineering Workflow Skills"
Cohesion: 0.07
Nodes (32): Architecture Health Loop, Ask Matt, Context Hygiene, Idea-to-Ship Main Flow, Multi-session Issue Flow, Prototype Detour, Triage and Diagnosis On-ramps, Code Review (+24 more)

### Community 4 - "Biome Code Quality Rules"
Cohesion: 0.05
Nodes (42): source, assist, actions, enabled, noUnusedImports, useExhaustiveDependencies, css, parser (+34 more)

### Community 5 - "Skill Contracts and Triage"
Cohesion: 0.06
Nodes (40): PRD Template, Ready-for-Agent PRD Publication, Highest-Level Test Seam Selection, To-PRD Skill, Agent Brief, Behavioral, Not Procedural Contract, Complete Acceptance Criteria, Durability over Precision (+32 more)

### Community 6 - "Deep Module Design"
Cohesion: 0.10
Nodes (34): Deepening, Dependency Classification, In-process Dependency, Local-substitutable Dependency, Ports and Adapters, Remote but Owned Dependency, Replace-don't-layer Testing, True External Dependency (+26 more)

### Community 7 - "CI and Release Automation"
Cohesion: 0.09
Nodes (34): Weekly Cargo Updates, Dependabot Configuration, Weekly GitHub Actions Updates, Weekly npm Updates, Release Pipeline, Release Pipeline, CI/CD Implementation Plan, CI/CD Design (+26 more)

### Community 8 - "Repository Architecture Guides"
Cohesion: 0.08
Nodes (34): Account Verification Flow, Window Startup Anti-Flash Handshake, Browser Automation Architecture, Browser Lifecycle Cleanup, Browser Login Flow, Daily Report, Jira Integration, Live Session Probe (+26 more)

### Community 9 - "Research and Teaching Skills"
Cohesion: 0.08
Nodes (28): Background Research Agent, Cited Markdown Findings, Primary-Source Research, Research Skill, Evidence-Gated Term Promotion, Decision-Grade Learning Record, Evidence of Learning, Learning Record Format (+20 more)

### Community 10 - "Tauri Packaging and Updates"
Cohesion: 0.06
Nodes (33): https://github.com/tasjen/daily-report/releases/latest/download/latest.json, icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security (+25 more)

### Community 11 - "Frontend TypeScript Configuration"
Cohesion: 0.07
Nodes (29): DOM, DOM.Iterable, src, vite/client, compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly (+21 more)

### Community 12 - "React Query Data Layer"
Cohesion: 0.13
Nodes (24): SubmitTaskEntry, useSaveAccountMutation(), useSaveFavoritesMutation(), useSavePreferencesMutation(), useSubmitTaskMutation(), useVerifyAccountMutation(), VerifyAccountError, accountOptions() (+16 more)

### Community 13 - "Prototype Design Methods"
Cohesion: 0.12
Nodes (20): Explicit Prototype Question, In-Memory Prototype State, Lightweight TUI, Logic Prototype, Portable Pure Logic Module, Pure Function Set, Pure Reducer, State Machine (+12 more)

### Community 14 - "UI Component Registry Config"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 15 - "Build Tool TypeScript Config"
Cohesion: 0.10
Nodes (20): node, vite.config.ts, compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection (+12 more)

### Community 16 - "Combobox UI Components"
Cohesion: 0.11
Nodes (3): react, react, useComboboxAnchor()

### Community 17 - "Account Verification Design"
Cohesion: 0.20
Nodes (17): Account Verification Implementation Plan, Account Portal URL and Credential Fields, Browser Session Reset on Account Save, Custom Portal Credentials Design, Fail-Fast Portal Configuration Read, No Compiled-In Portal Defaults, Portal Store-Reading Helpers, Account Verification Design (+9 more)

### Community 18 - "Submission Automation and Favorites"
Cohesion: 0.24
Nodes (16): Auto-Submit and Auto-Close Implementation Plan, Favorites Implementation Plan, Auto-Close Preference, Auto-Submit Preference, Auto-Submit and Auto-Close Design, Backend Automatic Submission Flow, Auto-Fill to Auto-Submit to Auto-Close Cascade Rule, Auto-Submit Preference Schema (+8 more)

### Community 20 - "Tauri Capability Permissions"
Cohesion: 0.13
Nodes (14): core:default, core:window:allow-set-background-color, core:window:allow-set-focus, core:window:allow-show, main, opener:default, process:allow-restart, store:default (+6 more)

### Community 21 - "Issue Tracker Integrations"
Cohesion: 0.06
Nodes (37): Prototype Answer Capture, Throwaway Prototype, UI Winner Cleanup, External Pull Request Triage, GitHub Issue Tracker, GitHub Wayfinding Operations, Shared GitHub Issue and PR Number Space, External Merge Request Triage (+29 more)

### Community 23 - "Claude Plugin Settings"
Cohesion: 0.18
Nodes (10): enabledPlugins, andrej-karpathy-skills@karpathy-skills, frontend-design@claude-plugins-official, superpowers@claude-plugins-official, hooks, PreToolUse, permissions, allow (+2 more)

### Community 24 - "Version Release Script"
Cohesion: 0.45
Nodes (10): args, bump(), compareVersions(), fail(), git(), readVersion(), replaceVersionLine(), requireReleasableState() (+2 more)

### Community 26 - "Development Bundle Branding"
Cohesion: 0.18
Nodes (10): icons-dev/128x128@2x.png, icons-dev/128x128.png, icons-dev/32x32.png, icons-dev/icon.icns, icons-dev/icon.ico, bundle, icon, identifier (+2 more)

### Community 28 - "Input Group Components"
Cohesion: 0.28
Nodes (4): InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants

### Community 30 - "Theme State Provider"
Cohesion: 0.25
Nodes (5): initialState, Theme, ThemeProviderContext, ThemeProviderProps, ThemeProviderState

### Community 31 - "Persistent Settings Store"
Cohesion: 0.29
Nodes (7): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, @tauri-apps/plugin-http, @tauri-apps/plugin-http

### Community 32 - "Daily Report Date Cards"
Cohesion: 0.53
Nodes (5): buildSummary(), DateCard(), getDateAfter(), getDateRelation(), Props

### Community 33 - "Git Hook Quality Gates"
Cohesion: 0.40
Nodes (5): Biome Pre-commit Check, Clippy Pre-push Check, Quality Gate Pipeline, Rustfmt Pre-commit Check, TypeScript Pre-push Check

### Community 34 - "Account Settings Form"
Cohesion: 0.50
Nodes (3): AccountForm(), formSchema, normalizePortalUrl()

### Community 36 - "Interactive Bug Diagnosis Loop"
Cohesion: 0.83
Nodes (3): capture(), hitl-loop.template.sh script, step()

### Community 37 - "Dead Code Analysis Config"
Cohesion: 0.50
Nodes (3): $schema, tags, -lintignore

### Community 38 - "Learning Retention Techniques"
Cohesion: 0.67
Nodes (3): Desirable Difficulty, Fluency Strength, Storage Strength

### Community 39 - "Frontend HTML Entrypoint"
Cohesion: 1.00
Nodes (3): Frontend HTML Shell, React Root Mount, Vite Frontend Entrypoint

### Community 49 - "Class Name Utility"
Cohesion: 0.15
Nodes (15): ADR Eligibility Test, ADR Format, Minimal ADR, Canonical Domain Language, CONTEXT.md Format, Multi-context Map, Single-context Layout, Code-model Cross-check (+7 more)

### Community 66 - "Core Runtime Dependencies"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: Update the README.md file about Graphify usage., Source Nodes

## Knowledge Gaps
- **352 isolated node(s):** `$schema`, `mcp__claude_ai_Figma__get_design_context`, `superpowers@claude-plugins-official`, `frontend-design@claude-plugins-official`, `andrej-karpathy-skills@karpathy-skills` (+347 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **97 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Triage State Machine` connect `Skill Contracts and Triage` to `Test Design Principles`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `$schema`, `mcp__claude_ai_Figma__get_design_context`, `superpowers@claude-plugins-official` to the rest of the system?**
  _352 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Portal Browser Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.14404223227752638 - nodes in this community are weakly interconnected._
- **Should `Test Design Principles` be split into smaller, more focused modules?**
  _Cohesion score 0.07096774193548387 - nodes in this community are weakly interconnected._
- **Should `Frontend Build Toolchain` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._
- **Should `Engineering Workflow Skills` be split into smaller, more focused modules?**
  _Cohesion score 0.07056451612903226 - nodes in this community are weakly interconnected._
- **Should `Biome Code Quality Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._