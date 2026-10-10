import { sqlProxy } from '../../../../../../server/service/sqlProxy';
export { options as OPTIONS } from '../../../../../../server/service/http';

export const POST = sqlProxy('v3/pipeline');
