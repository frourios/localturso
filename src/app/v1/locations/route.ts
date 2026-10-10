import { json } from '../../../../server/service/http';
import { platformRoute } from '../../../../server/service/platformRoute';
export { options as OPTIONS } from '../../../../server/service/http';

export const GET = platformRoute(async () => json({ locations: { local: 'Local machine' } }));
