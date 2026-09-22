# Suggested Component Architecture

Suggested conceptual structure:

- `LearningStagePage`
  - `LearningStageTopBar`
    - `BackToJourneyButton`
    - `TopMiniNodeProgress`
    - `ResourcesButton` (optional)
  - `LearningStageBody`
    - `StageContextPanel`
      - `StageIdentityHeader`
      - `StageIllustration`
      - `StageMeta`
    - `LessonWorkspace`
      - `LessonHeader`
      - `PromptBlock`
      - `ActivityArea`
      - `ExamplesPanel`
      - `InfoStrip`
      - `WorkspaceActions`

For the top progression strip:

- `TopMiniNodeProgress`
  - `TopMiniNode`
  - `TopMiniNodeConnector`

Drive all step-state rendering from a canonical status model.
