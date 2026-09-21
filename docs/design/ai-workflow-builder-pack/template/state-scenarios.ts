import type { StepStatus } from './journey-map-template';

export type Scenario = Record<1 | 2 | 3 | 4 | 5, StepStatus>;

export const scenarios: Record<string, Scenario> = {
  initial: { 1: 'available', 2: 'locked', 3: 'locked', 4: 'locked', 5: 'locked' },
  step1Current: { 1: 'current', 2: 'locked', 3: 'locked', 4: 'locked', 5: 'locked' },
  step1Complete: { 1: 'completed', 2: 'available', 3: 'locked', 4: 'locked', 5: 'locked' },
  step2Current: { 1: 'completed', 2: 'current', 3: 'locked', 4: 'locked', 5: 'locked' },
  step3Current: { 1: 'completed', 2: 'completed', 3: 'current', 4: 'locked', 5: 'locked' },
  step4Current: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'current', 5: 'locked' },
  step5Current: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'current' },
  finished: { 1: 'completed', 2: 'completed', 3: 'completed', 4: 'completed', 5: 'completed' },
};
