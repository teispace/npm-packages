/**
 * Templates for a feature's `api/` folder: the v2 data-layer shape.
 * Schema is the source of truth; server.ts is the DAL; actions.ts holds the
 * Server Actions; queries.ts the client-side TanStack Query surface.
 */
export interface ApiTemplateParams {
  /** kebab-case feature name, e.g. `blog-post` */
  kebabName: string;
  /** camelCase, e.g. `blogPost` */
  camelName: string;
  /** PascalCase, e.g. `BlogPost` */
  pascalName: string;
}

export const apiSchemaTemplate = ({
  pascalName,
  camelName,
}: ApiTemplateParams): string => `import { z } from 'zod';

/**
 * Wire contracts for the ${camelName} feature. Types are inferred from the
 * schemas, so a response that drifts from the contract fails validation at
 * the transport instead of surfacing as \`undefined\` in a component.
 */
export const ${camelName}Schema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
});
export type ${pascalName} = z.infer<typeof ${camelName}Schema>;

export const ${camelName}ListSchema = z.array(${camelName}Schema);

export const create${pascalName}InputSchema = z.object({
  title: z.string().min(1).max(200),
});
export type Create${pascalName}Input = z.infer<typeof create${pascalName}InputSchema>;

export const update${pascalName}InputSchema = create${pascalName}InputSchema.partial().extend({
  id: z.string(),
});
export type Update${pascalName}Input = z.infer<typeof update${pascalName}InputSchema>;
`;

export const apiKeysTemplate = ({ kebabName, camelName }: ApiTemplateParams): string => `/**
 * Query keys owned by the feature. Everything under \`${camelName}Keys.all\` can
 * be invalidated at once; narrower keys target one resource.
 */
export const ${camelName}Keys = {
  all: ['${kebabName}'] as const,
  list: () => [...${camelName}Keys.all, 'list'] as const,
  detail: (id: string) => [...${camelName}Keys.all, 'detail', id] as const,
} as const;
`;

export const apiServerTemplate = ({
  pascalName,
  camelName,
}: ApiTemplateParams): string => `import 'server-only';

import { AppApis } from '@/lib/config/app-apis';
import { serverHttp } from '@/lib/http/server';

import { ${camelName}ListSchema, ${camelName}Schema } from './schema';

export const ${camelName.toUpperCase()}_TAG = '${camelName}';

/**
 * Data access for Server Components. These reads act as the signed-in user
 * (\`serverHttp\` forwards the session cookie), so they must not be wrapped in
 * \`use cache\` and the calling component must sit under \`<Suspense>\`.
 *
 * For public, user-independent data use \`publicServerHttp\` inside a
 * \`'use cache'\` function with \`cacheTag(${camelName.toUpperCase()}_TAG)\` and a \`cacheLife\`.
 */
export const list${pascalName}s = async () =>
  serverHttp.get(AppApis.${camelName}.list, { schema: ${camelName}ListSchema });

export const get${pascalName} = async (id: string) =>
  serverHttp.get(AppApis.${camelName}.detail(id), { schema: ${camelName}Schema });
`;

export const apiActionsTemplate = ({
  pascalName,
  camelName,
}: ApiTemplateParams): string => `'use server';

import { revalidateTag } from 'next/cache';

import { authActionClient } from '@/lib/actions';
import { AppApis } from '@/lib/config/app-apis';
import { serverHttp } from '@/lib/http/server';

import { create${pascalName}InputSchema, ${camelName}Schema, update${pascalName}InputSchema } from './schema';
import { ${camelName.toUpperCase()}_TAG } from './server';

/**
 * Server Actions. \`authActionClient\` validates the input, loads the session
 * (\`ctx.user\`), refuses anonymous callers, and turns thrown errors into a
 * plain \`result.serverError\`.
 */
export const create${pascalName} = authActionClient
  .metadata({ name: '${camelName}.create' })
  .inputSchema(create${pascalName}InputSchema)
  .action(async ({ parsedInput }) => {
    const result = await serverHttp.post(AppApis.${camelName}.create, parsedInput, {
      schema: ${camelName}Schema,
    });
    if (!result.ok) throw result.error;
    revalidateTag(${camelName.toUpperCase()}_TAG, 'max');
    return result.data;
  });

export const update${pascalName} = authActionClient
  .metadata({ name: '${camelName}.update' })
  .inputSchema(update${pascalName}InputSchema)
  .action(async ({ parsedInput: { id, ...changes } }) => {
    const result = await serverHttp.patch(AppApis.${camelName}.update(id), changes, {
      schema: ${camelName}Schema,
    });
    if (!result.ok) throw result.error;
    revalidateTag(${camelName.toUpperCase()}_TAG, 'max');
    return result.data;
  });

export const delete${pascalName} = authActionClient
  .metadata({ name: '${camelName}.delete' })
  .inputSchema(${camelName}Schema.pick({ id: true }))
  .action(async ({ parsedInput }) => {
    const result = await serverHttp.delete<void>(AppApis.${camelName}.delete(parsedInput.id));
    if (!result.ok) throw result.error;
    revalidateTag(${camelName.toUpperCase()}_TAG, 'max');
    return { deleted: true as const };
  });
`;

export const apiQueriesTemplate = ({
  pascalName,
  camelName,
}: ApiTemplateParams): string => `import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';

import { AppApis } from '@/lib/config/app-apis';
import { http } from '@/lib/http';
import { unwrapForQuery } from '@/lib/query';

import { ${camelName}Keys } from './keys';
import { ${camelName}ListSchema, ${camelName}Schema } from './schema';

/**
 * Client-side reads. A Server Component can \`prefetchQuery(${camelName}ListQuery())\`
 * inside \`<HydrateQueries>\` so the hook below renders with data on first paint.
 */
export const ${camelName}ListQuery = () =>
  queryOptions({
    queryKey: ${camelName}Keys.list(),
    queryFn: ({ signal }) =>
      http.get(AppApis.${camelName}.list, { schema: ${camelName}ListSchema, signal }).then(unwrapForQuery),
  });

export const ${camelName}Query = (id: string) =>
  queryOptions({
    queryKey: ${camelName}Keys.detail(id),
    queryFn: ({ signal }) =>
      http.get(AppApis.${camelName}.detail(id), { schema: ${camelName}Schema, signal }).then(unwrapForQuery),
  });

export const use${pascalName}List = () => useSuspenseQuery(${camelName}ListQuery());
export const use${pascalName} = (id: string) => useSuspenseQuery(${camelName}Query(id));
`;

export const apiEndpointsTemplate = ({
  camelName,
  kebabName,
}: ApiTemplateParams): string => `  ${camelName}: {
    list: '/${kebabName}',
    detail: (id: string) => \`/${kebabName}/\${id}\`,
    create: '/${kebabName}',
    update: (id: string) => \`/${kebabName}/\${id}\`,
    delete: (id: string) => \`/${kebabName}/\${id}\`,
  },`;
