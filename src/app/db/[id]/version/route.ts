import { sqlProxy } from '../../../../../server/service/sqlProxy';
export { options as OPTIONS } from '../../../../../server/service/http';

export const GET = sqlProxy('version');
