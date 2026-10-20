# Design
## Source of truth
Status: Active. Date: 2026-10-20. Product surfaces: five-round Korean public speaking study and administrator dashboard. Evidence reviewed: FeedbackWorkspace, ChatPanel, sense.css, README, db/schema.sql, and the existing experiment routes.
## Brand
Calm, legible Korean research app. Use the existing visual identity. Avoid distracting decoration during presentations. The administrator console should feel restrained and operational, with clear research-data safeguards.
## Product goals
Record five presentations, process feedback after rounds 1–4, and retain participant-linked research data. Round 5 completes after recording and analysis without response activities. Researchers can see study progress by group and remove an individual participant's stored study data.
## Personas and jobs
Students record presentations and interpret feedback. Researchers preassign conditions, collect process records, monitor participation, and handle participant data.
## Information architecture
Study: entry → preparation → recording → analysis with video review → learner opens feedback → sense-making → action-planning → next-round preparation. The first preparation countdown is 10 minutes. Presentation recording is capped at 5 minutes 30 seconds and can be ended early. A shared 15-minute countdown runs through feedback sense-making, action planning, and the following round's preparation. Countdown timers can be paused and resumed; pausing during recording also pauses media capture, with active and paused durations stored separately. Expiry starts recording automatically; presentation expiry stops and uploads the recording. Shared-block expiry advances to the next round and retains any partial responses. The preparation screen shows the speaking passage at full width, then the preceding action plan in three columns and recording controls below. The entry and completion screens link the pre-survey and post-survey. Existing control and experiment routes remain condition protected.

Admin: `/admin` → password login → overview totals → searchable/filterable participant table → participant-level deletion with typed-ID confirmation. The table shows group, current state, round progress, recording count, and recent activity.
## Design principles
One primary next action per screen. Preserve existing feedback questions and area tabs. Keep recording controls sparse. Use plain status labels and make irreversible data actions explicit.
## Visual language
Reuse sense.css colors, typography, buttons and spacing for study screens. The recording surface is neutral with a small bottom-right webcam preview and a minutes/seconds timer. Admin surfaces use a pale neutral background, white panels, blue accents, compact data rows, and restrained group/status colors.
## Components
AnalysisReview keeps the recorded video available through polling and after feedback becomes ready, until the learner chooses to continue. RubricTooltip shows canonical definitions without a permanently expanded rubric block. ExperimentRunner owns rounds. Recorder owns camera and microphone lifecycle. FeedbackWorkspace displays actual recording and three generated area feedback items. ChatPanel appears only for experiment participants. AdminLogin handles protected entry; AdminDashboard presents progress and confirmed deletion.
## Accessibility
Semantic controls, Korean labels, keyboard tabs, visible focus, readable 15px+ study text, status/error announcements. Timer updates do not repeatedly interrupt screen readers. Admin filters and destructive actions have accessible labels and live feedback; tables keep semantic headers and horizontal scrolling on narrow screens.
## Responsive behavior
Existing stacked mobile feedback layout. Recording preview scales to viewport width. No horizontal overflow at 390px. Admin metrics collapse to two columns and the participant table scrolls horizontally on narrow screens.
## Interaction states
Study: camera permission failure, interrupted recording, upload retry, analysis retry, pending server saves and disconnected telemetry are visible. Retain unsent responses locally and block next-round transitions until server saves succeed. Admin: unauthenticated users see login; wrong passwords show an inline error; empty filters show an empty state; deletion requires typing the participant ID and reports success or failure.
## Content voice
Problem descriptions cite observed evidence and rubric. The visible feedback is one coherent paragraph with no evidence/reason/solution subheadings. Criterion names and area labels come from fdb_cat.json. Each of the 10 active criteria receives an independent assessment and private score before deterministic minimum selection within each major area. Ties follow JSON order. Only the selected criterion appears in the area. Its heading reveals that criterion’s definition and level descriptions on hover, keyboard focus or touch; the level labels are 매우 잘함, 잘함, 보통, 노력요함; no actual score or numeric level label is shown. Unknown legacy criterion IDs never reveal the whole major-area rubric. Control feedback is direct. Experiment feedback uses gentle solution suggestions, limited evidence-backed praise and appropriate sentence-final emoji. Admin labels are concise and factual; deletion copy names the records affected.
## Implementation constraints
Next.js 16 local documentation governs APIs. Firebase Storage stores recordings under experiments/participant/attempt_round. PostgreSQL stores file metadata and study data. Engine service is configured on the server. Participant IDs are research identifiers with access by ID, per the requested protocol. Admin access requires `ADMIN_PASSWORD` and uses a signed, HTTP-only session cookie based on `SESSION_SECRET`. Admin reads and mutations are server-side; participant deletion removes linked videos and study rows while retaining the preassigned group assignment.
## Open questions
[x] Researcher requested 100 fixed random assignments, 50 per group, with the first two per group reserved for tests. See db/assignments.csv.
[ ] Researcher defines topic and target duration; the app records the student presentation without a topic form, with a two-hour technical upper bound.
[ ] Configure `ADMIN_PASSWORD` for each deployment environment before using `/admin`.
[ ] Confirm whether round-level reset and export actions are needed in addition to participant-level deletion.
