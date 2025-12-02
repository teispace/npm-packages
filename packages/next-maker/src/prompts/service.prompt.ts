import enquirer from 'enquirer';

interface ServiceOptions {
  serviceName: string;
  httpClient: 'axios' | 'fetch';
}

export const promptForServiceDetails = async (
  name?: string,
  axiosFlag?: boolean,
  fetchFlag?: boolean,
  availableClients?: 'axios' | 'fetch' | 'both' | 'none',
): Promise<ServiceOptions> => {
  const serviceName =
    name ||
    (
      await enquirer.prompt<{ serviceName: string }>({
        type: 'input',
        name: 'serviceName',
        message: 'Service name (kebab-case):',
        validate: (input: string) => {
          if (!input) return 'Service name is required';
          if (!/^[a-z0-9-]+$/.test(input))
            return 'Service name must be lowercase with hyphens only';
          return true;
        },
      })
    ).serviceName;

  let httpClient: 'axios' | 'fetch';

  // If flags are provided, use them
  if (axiosFlag !== undefined) {
    httpClient = 'axios';
  } else if (fetchFlag !== undefined) {
    httpClient = 'fetch';
  } else {
    // Prompt based on available clients
    if (availableClients === 'axios') {
      httpClient = 'axios';
    } else if (availableClients === 'fetch') {
      httpClient = 'fetch';
    } else if (availableClients === 'both') {
      // Let user choose
      const response = await enquirer.prompt<{ httpClient: 'axios' | 'fetch' }>({
        type: 'select',
        name: 'httpClient',
        message: 'Choose HTTP client:',
        choices: ['axios', 'fetch'],
      });
      httpClient = response.httpClient;
    } else {
      // This shouldn't happen as we check in the command
      httpClient = 'axios';
    }
  }

  return {
    serviceName,
    httpClient,
  };
};
