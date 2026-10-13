import type { AlertEventType } from '@/types/api';

export const EVENT_LABELS: Record<AlertEventType, string> = {
  WORKFLOW_FAILURE: 'Workflow failed',
  DEPLOYMENT_FAILURE: 'Deployment failed',
  SERVICE_DOWN: 'Service down',
  SERVICE_RECOVERED: 'Service recovered',
  INCIDENT_OPENED: 'Incident opened',
  INCIDENT_RESOLVED: 'Incident resolved',
};

export const ALL_EVENTS = Object.keys(EVENT_LABELS) as AlertEventType[];

/** Recovery and resolution are good news; everything else needs attention. */
export function eventTone(type: AlertEventType): 'success' | 'error' {
  return type === 'SERVICE_RECOVERED' || type === 'INCIDENT_RESOLVED' ? 'success' : 'error';
}
