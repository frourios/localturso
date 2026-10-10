import { json } from '../../../../server/service/http';
import { platformRoute } from '../../../../server/service/platformRoute';
import { env } from '../../../../server/service/serverEnvs';
export { options as OPTIONS } from '../../../../server/service/http';

export const GET = platformRoute(async () =>
  json([{ name: 'LocalTurso', slug: env.LOCALTURSO_ORG, type: 'personal' }]),
);
