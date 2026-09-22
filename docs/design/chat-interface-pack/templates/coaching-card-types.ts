export type CoachingCardType =
  | 'problem-summary'
  | 'specificity'
  | 'example'
  | 'refinement'
  | 'next-step';

export interface CoachingCardData {
  type: CoachingCardType;
  title: string;
  body?: string;
  items?: string[];
  action?: {
    id: string;
    label: string;
  };
}

export const examples: CoachingCardData[] = [
  {
    type: 'problem-summary',
    title: 'Your problem so far',
    body: 'Automate weekly status reporting to reduce manual work.',
  },
  {
    type: 'specificity',
    title: 'Try making this more specific',
    items: [
      'Who needs the reports?',
      'What information is included?',
      'Where does the data come from?',
      'What is the biggest pain point right now?',
    ],
  },
  {
    type: 'next-step',
    title: 'Next step',
    body: 'Ready to move on?',
    action: { id: 'save-and-continue', label: 'Save and continue' },
  },
];
