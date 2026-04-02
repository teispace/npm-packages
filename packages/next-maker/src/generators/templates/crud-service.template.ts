export const crudServiceTemplate = (params: {
  camelName: string;
  pascalName: string;
  httpClient: 'axios' | 'fetch';
}): string => {
  const { camelName, pascalName, httpClient } = params;
  const clientImport =
    httpClient === 'axios'
      ? `import { axiosClient } from '@/lib/utils/http';`
      : `import { fetchClient } from '@/lib/utils/http';`;
  const clientName = httpClient === 'axios' ? 'axiosClient' : 'fetchClient';

  return `import { AppApis } from '@/lib/config';
${clientImport}
import { ResultAsync } from '@/types';

/**
 * Summary type used in list responses (e.g., cards, tables).
 */
export interface ${pascalName}Summary {
  id: string;
  // Add list/card fields here (title, thumbnail, status, etc.)
}

/**
 * Detail type used in single-item responses (e.g., detail page).
 */
export interface ${pascalName}Detail extends ${pascalName}Summary {
  // Add detailed fields here (content, metadata, relations, etc.)
}

export interface Create${pascalName}Dto {
  // Add create fields here
}

export interface Update${pascalName}Dto {
  // Add update fields here
}

export const ${camelName}Service = {
  getAll: (): ResultAsync<${pascalName}Summary[]> => {
    return ${clientName}.get<${pascalName}Summary[]>(AppApis.${camelName}.getAll);
  },

  getById: (id: string): ResultAsync<${pascalName}Detail> => {
    return ${clientName}.get<${pascalName}Detail>(AppApis.${camelName}.getById(id));
  },

  create: (data: Create${pascalName}Dto): ResultAsync<${pascalName}Detail> => {
    return ${clientName}.post<${pascalName}Detail>(AppApis.${camelName}.create, data);
  },

  update: (id: string, data: Update${pascalName}Dto): ResultAsync<${pascalName}Detail> => {
    return ${clientName}.patch<${pascalName}Detail>(AppApis.${camelName}.update(id), data);
  },

  delete: (id: string): ResultAsync<void> => {
    return ${clientName}.delete<void>(AppApis.${camelName}.delete(id));
  },
};
`;
};

export const crudApiConfigTemplate = (params: { camelName: string; kebabName: string }): string => {
  const { camelName, kebabName } = params;
  return `  ${camelName}: {
    base: \`\${API_PREFIX}/${kebabName}\`,
    getAll: \`\${API_PREFIX}/${kebabName}\`,
    getById: (id: string) => \`\${API_PREFIX}/${kebabName}/\${id}\`,
    create: \`\${API_PREFIX}/${kebabName}\`,
    update: (id: string) => \`\${API_PREFIX}/${kebabName}/\${id}\`,
    delete: (id: string) => \`\${API_PREFIX}/${kebabName}/\${id}\`,
  },`;
};
