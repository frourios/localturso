import { groupQuery } from '../../../../../../../../server/domain/group/store/groupQuery';
import { GroupUseCase } from '../../../../../../../../server/domain/group/useCase/groupUseCase';
import { getStore } from '../../../../../../../../server/service/drizzleClient';
import { json, readJson } from '../../../../../../../../server/service/http';
import { groupPlatformRoute as platformRoute } from '../../../../../../../../server/service/platformRoute';
import { groupConfigSchema } from '../../../../../../../schemas/platform';
export { options as OPTIONS } from '../../../../../../../../server/service/http';

export const GET = platformRoute<{ org: string; name: string }>(async (_request, { name }) =>
  json({ delete_protection: (await groupQuery.find(await getStore(), name)).deleteProtection }),
);

export const PATCH = platformRoute<{ org: string; name: string }>(async (request, { name }) =>
  json(
    await new GroupUseCase(await getStore()).configure(
      name,
      groupConfigSchema.parse(await readJson(request)).delete_protection,
    ),
  ),
);
