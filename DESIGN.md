# Design
## Source of truth
Status: Active. Date: 2026-10-14. Evidence: existing FeedbackWorkspace, ChatPanel, sense.css, README and the requested five-round experiment.
## Brand
Calm, legible Korean research app. Use the existing visual identity. Avoid distracting decoration during presentations.
## Product goals
Record five presentations, process feedback after rounds 1–4, and retain participant-linked research data. Round 5 completes after recording and analysis without response activities.
## Personas and jobs
Students record presentations and interpret feedback. Researchers preassign conditions and collect process records.
## Information architecture
Entry → preparation → recording → analysis with video review → learner opens feedback → sense-making → action-planning → next-round preparation. The preparation screen shows the preceding action plan. Existing control and experiment routes remain condition protected.
## Design principles
One primary next action per screen. Preserve existing feedback questions and area tabs. Keep recording controls sparse.
## Visual language
Reuse sense.css colors, typography, buttons and spacing. The recording surface is neutral with a small bottom-right webcam preview and a minutes/seconds timer.
## Components
AnalysisReview keeps the recorded video available through polling and after feedback becomes ready, until the learner chooses to continue. RubricTooltip shows canonical definitions without a permanently expanded rubric block.
ExperimentRunner owns rounds. Recorder owns camera and microphone lifecycle. FeedbackWorkspace displays actual recording and three generated area feedback items. ChatPanel appears only for experiment participants.
## Accessibility
Semantic controls, Korean labels, keyboard tabs, visible focus, readable 15px+ text, status/error announcements. Timer updates do not repeatedly interrupt screen readers.
## Responsive behavior
Existing stacked mobile feedback layout. Recording preview scales to viewport width. No horizontal overflow at 390px.
## Interaction states
Camera permission failure, interrupted recording, upload retry, analysis retry, pending server saves and disconnected telemetry are visible. Retain unsent responses locally and block next-round transitions until server saves succeed.
## Content voice
Problem descriptions cite observed evidence and rubric. The visible feedback is one coherent paragraph with no evidence/reason/solution subheadings. Criterion names and area labels come from fdb_cat.json. Each of the 12 criteria receives an independent assessment and private score before deterministic minimum selection within each major area. Ties follow JSON order. Only the selected criterion appears in the area. Its heading reveals that criterion’s definition and level descriptions on hover, keyboard focus or touch; no score or numeric level label is shown. Unknown legacy criterion IDs never reveal the whole major-area rubric. Control feedback is direct. Experiment feedback uses gentle solution suggestions, limited evidence-backed praise and appropriate sentence-final emoji.
## Implementation constraints
Next.js 16 local documentation governs APIs. PostgreSQL stores study data and recordings. Engine service is configured on the server. Participant IDs are research identifiers with access by ID, per the requested protocol.
## Open questions
[x] Researcher requested 100 fixed random assignments, 50 per group, with the first two per group reserved for tests. See db/assignments.csv.
[ ] Researcher defines topic and target duration; the app records the student presentation without a topic form, with a two-hour technical upper bound.
