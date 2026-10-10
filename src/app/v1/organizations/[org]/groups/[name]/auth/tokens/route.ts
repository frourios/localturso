import { groupQuery } from '../../../../../../../../../server/domain/group/store/groupQuery';
import { getStore } from '../../../../../../../../../server/service/drizzleClient';
import { json } from '../../../../../../../../../server/service/http';
import { platformRoute } from '../../../../../../../../../server/service/platformRoute';
import { createToken } from '../../../../../../../../../server/service/token';
import { rejectTokenBody } from '../../../../../../../../../server/service/tokenRequest';
import { tokenQuerySchema } from '../../../../../../../../schemas/platform';
export { options as OPTIONS } from '../../../../../../../../../server/service/http';

export const POST = platformRoute<{ org: string; name: string }>(async (request, { name }) => {
  const store = await getStore();
  const record = await groupQuery.find(store, name);
  const query = tokenQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  await rejectTokenBody(request);
  return json({ jwt: await createToken(store, record, query.expiration, query.authorization) });
});
