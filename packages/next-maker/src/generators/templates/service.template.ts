export const serviceTemplate = (params: {
  camelName: string;
  httpClient: 'axios' | 'fetch';
}): string => {
  const { camelName, httpClient } = params;
  const clientImport =
    httpClient === 'axios'
      ? `import { axiosClient } from '@/lib/utils/http';`
      : `import { fetchClient } from '@/lib/utils/http';`;
  const clientName = httpClient === 'axios' ? 'axiosClient' : 'fetchClient';

  return `import { AppApis } from '@/lib/config';
${clientImport}
import { ResultAsync } from '@/types';

export const ${camelName}Service = {
  getAll: (): ResultAsync<string> => {
    return ${clientName}.get<string>(AppApis.${camelName}.getAll);
  },
};
`;
};
