import { PlatformError } from './platformError';
import { env } from './serverEnvs';

export function validateResourceName(name: string, kind: 'database' | 'group') {
  // The hostname label includes the organization suffix and its separator (63 bytes total).
  const maximum = 63 - env.LOCALTURSO_ORG.length - 1;
  let message: string | undefined;
  if (name.length < 1 || name.length > maximum)
    message = `name must contain between 1 and ${maximum} characters`;
  else if (!/^[a-z0-9-]+$/.test(name))
    message = 'name may only contain numbers, lowercase letters, and dashes';
  else if (name.startsWith('-') || name.endsWith('-'))
    message = 'name may not start or end with a dash';
  if (message) throw new PlatformError(400, `invalid ${kind} name: ${message}`, 'invalid_name');
}
