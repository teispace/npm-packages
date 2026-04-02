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

export interface ${pascalName} {
  id: string;
  // Add your ${camelName} properties here
}

export interface Create${pascalName}Dto {
  // Add create fields here
}

export interface Update${pascalName}Dto {
  // Add update fields here
}

export const ${camelName}Service = {
  getAll: (): ResultAsync<${pascalName}[]> => {
    return ${clientName}.get<${pascalName}[]>(AppApis.${camelName}.getAll);
  },

  getById: (id: string): ResultAsync<${pascalName}> => {
    return ${clientName}.get<${pascalName}>(AppApis.${camelName}.getById(id));
  },

  create: (data: Create${pascalName}Dto): ResultAsync<${pascalName}> => {
    return ${clientName}.post<${pascalName}>(AppApis.${camelName}.create, data);
  },

  update: (id: string, data: Update${pascalName}Dto): ResultAsync<${pascalName}> => {
    return ${clientName}.patch<${pascalName}>(AppApis.${camelName}.update(id), data);
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
