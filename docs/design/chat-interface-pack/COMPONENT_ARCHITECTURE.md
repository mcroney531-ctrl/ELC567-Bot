# Suggested Component Architecture

```text
ChatStagePage
  LearningStageTopBar
    BackToJourneyButton
    TopMiniNodeProgress
      TopMiniNode
    ResourcesButton (optional)

  ChatStageBody
    StageContextRail
      StageIdentity
      StageIllustration
      CurrentFocus
      StageMicroProgress (optional)

    CoachChatPanel
      CoachHeader
      MessageList
        AssistantMessage
        UserMessage
        CoachingCardMessage
      TypingIndicator
      ChatComposer
```

Prefer reuse of existing `LearningStageTopBar` / `TopMiniNodeProgress` components from the main learning stage rather than creating duplicates.

Keep stage state in one canonical model and pass it downward.
