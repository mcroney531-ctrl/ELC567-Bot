export type StepStatus = 'locked' | 'available' | 'current' | 'completed';

export interface StepScenarioItem {
  id: number;
  key: 'identify' | 'map' | 'envision' | 'refine' | 'deploy';
  status: StepStatus;
}

export const scenarios: Record<string, StepScenarioItem[]> = {
  initial: [
    { id: 1, key: 'identify', status: 'available' },
    { id: 2, key: 'map', status: 'locked' },
    { id: 3, key: 'envision', status: 'locked' },
    { id: 4, key: 'refine', status: 'locked' },
    { id: 5, key: 'deploy', status: 'locked' },
  ],
  step01Current: [
    { id: 1, key: 'identify', status: 'current' },
    { id: 2, key: 'map', status: 'locked' },
    { id: 3, key: 'envision', status: 'locked' },
    { id: 4, key: 'refine', status: 'locked' },
    { id: 5, key: 'deploy', status: 'locked' },
  ],
  step01CompletedStep02Available: [
    { id: 1, key: 'identify', status: 'completed' },
    { id: 2, key: 'map', status: 'available' },
    { id: 3, key: 'envision', status: 'locked' },
    { id: 4, key: 'refine', status: 'locked' },
    { id: 5, key: 'deploy', status: 'locked' },
  ],
  step02Current: [
    { id: 1, key: 'identify', status: 'completed' },
    { id: 2, key: 'map', status: 'current' },
    { id: 3, key: 'envision', status: 'locked' },
    { id: 4, key: 'refine', status: 'locked' },
    { id: 5, key: 'deploy', status: 'locked' },
  ],
  midFlow: [
    { id: 1, key: 'identify', status: 'completed' },
    { id: 2, key: 'map', status: 'completed' },
    { id: 3, key: 'envision', status: 'current' },
    { id: 4, key: 'refine', status: 'locked' },
    { id: 5, key: 'deploy', status: 'locked' },
  ],
  allCompleted: [
    { id: 1, key: 'identify', status: 'completed' },
    { id: 2, key: 'map', status: 'completed' },
    { id: 3, key: 'envision', status: 'completed' },
    { id: 4, key: 'refine', status: 'completed' },
    { id: 5, key: 'deploy', status: 'completed' },
  ],
};
