import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { kebabToCamel } from '../../config/utils';

interface GenerateServiceOptions {
  serviceName: string;
  servicePath: string;
  httpClient: 'axios' | 'fetch';
}

export const generateServiceFiles = async (options: GenerateServiceOptions): Promise<void> => {
  await generateServiceFile(options);
};

const generateServiceFile = async (options: GenerateServiceOptions): Promise<void> => {
  const { serviceName, servicePath, httpClient } = options;
  const camelName = kebabToCamel(serviceName);

  let content: string;

  if (httpClient === 'axios') {
    content = `import { axiosClient } from '@/lib/utils/http';

export const ${camelName}Service = {
  // Add your API methods here
  // Example:
  // getAll: async () => {
  //   const result = await axiosClient.get<YourType[]>('/${serviceName}');
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // getById: async (id: string) => {
  //   const result = await axiosClient.get<YourType>(\`/${serviceName}/\${id}\`);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // create: async (data: YourCreateType) => {
  //   const result = await axiosClient.post<YourType>('/${serviceName}', data);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // update: async (id: string, data: YourUpdateType) => {
  //   const result = await axiosClient.put<YourType>(\`/${serviceName}/\${id}\`, data);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // delete: async (id: string) => {
  //   const result = await axiosClient.delete<void>(\`/${serviceName}/\${id}\`);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
};
`;
  } else {
    // fetch
    content = `import { fetchClient } from '@/lib/utils/http';

export const ${camelName}Service = {
  // Add your API methods here
  // Example:
  // getAll: async () => {
  //   const result = await fetchClient.get<YourType[]>('/${serviceName}');
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // getById: async (id: string) => {
  //   const result = await fetchClient.get<YourType>(\`/${serviceName}/\${id}\`);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // create: async (data: YourCreateType) => {
  //   const result = await fetchClient.post<YourType>('/${serviceName}', data);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // update: async (id: string, data: YourUpdateType) => {
  //   const result = await fetchClient.put<YourType>(\`/${serviceName}/\${id}\`, data);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
  //
  // delete: async (id: string) => {
  //   const result = await fetchClient.delete<void>(\`/${serviceName}/\${id}\`);
  //   if (result.isErr()) throw result.error;
  //   return result.value;
  // },
};
`;
  }

  const fileName = `${serviceName}.service.ts`;
  await writeFile(path.join(servicePath, fileName), content);
};
