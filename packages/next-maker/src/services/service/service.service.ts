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
    content = `import { AppApis } from '@/lib/config';
import { axiosClient } from '@/lib/utils/http';
import { ResultAsync } from '@/types';

export const ${camelName}Service = {
  getAll: (): ResultAsync<string> => {
    return axiosClient.get<string>(AppApis.${camelName}.getAll);
  },
};
`;
  } else {
    // fetch
    content = `import { AppApis } from '@/lib/config';
import { fetchClient } from '@/lib/utils/http';
import { ResultAsync } from '@/types';

export const ${camelName}Service = {
  getAll: (): ResultAsync<string> => {
    return fetchClient.get<string>(AppApis.${camelName}.getAll);
  },
};
`;
  }

  const fileName = `${serviceName}.service.ts`;
  await writeFile(path.join(servicePath, fileName), content);
};
