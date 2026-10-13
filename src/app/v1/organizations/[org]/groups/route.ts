import { toGroupDto } from '../../../../../../server/domain/group/store/groupDto';
import { groupQuery } from '../../../../../../server/domain/group/store/groupQuery';
import { GroupUseCase } from '../../../../../../server/domain/group/useCase/groupUseCase';
import { getStore } from '../../../../../../server/service/drizzleClient';
import { json, readJson } from '../../../../../../server/service/http';
import { groupPlatformRoute as platformRoute } from '../../../../../../server/service/platformRoute';
import { env } from '../../../../../../server/service/serverEnvs';
import { createGroupSchema } from '../../../../../schemas/platform';
export { options as OPTIONS } from '../../../../../../server/service/http';

export const GET = platformRoute<{ org: string }>(async () =>
  json({
    groups: (await groupQuery.list(await getStore()))
      .filter((group) => !env.LOCALTURSO_TOKEN_GROUP || group.name === env.LOCALTURSO_TOKEN_GROUP)
      .map(toGroupDto),
  }),
);

export const POST = platformRoute<{ org: string }>(async (request) => {
  const input = createGroupSchema.parse(await readJson(request));
  return json({
    group: toGroupDto(await new GroupUseCase(await getStore()).create(input.name, input.location)),
  });
});
