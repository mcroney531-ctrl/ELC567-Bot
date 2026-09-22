# Chat Behavior Spec

## Message types

Recommended canonical UI message types:

```ts
type ChatMessageKind =
  | 'assistant'
  | 'user'
  | 'system'
  | 'coaching-card';
```

Do not encode visual variants as separate ad-hoc message systems if one renderer can handle them.

## Assistant states

- idle
- composing/loading
- streaming/receiving (if existing implementation supports streaming)
- complete
- error

## Composer states

- empty
- drafting
- sending
- send-failed

## Scroll behavior

Auto-scroll when:
- the user sends a new message
- the learner is already close to the bottom and a new assistant message arrives

Do not auto-scroll aggressively when:
- the learner has intentionally scrolled upward

## In-chat coaching cards

Structured cards should be rendered from typed data where possible.

Example:

```ts
interface CoachingCard {
  type: 'summary' | 'specificity' | 'example' | 'refinement' | 'next-step';
  title: string;
  body?: string;
  items?: string[];
  action?: {
    label: string;
    id: string;
  };
}
```

## Stage state

The chat screen consumes the canonical stage state.
It should not own a separate copy of progression truth.
