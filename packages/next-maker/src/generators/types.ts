export interface SliceGeneratorOptions {
  name: string;
  outputPath: string;
  persist: boolean;
}

export interface ServiceGeneratorOptions {
  name: string;
  outputPath: string;
  httpClient: 'axios' | 'fetch';
}

export interface FeatureGeneratorOptions {
  name: string;
  outputPath: string;
  createStore: boolean;
  persistStore: boolean;
  createService: boolean;
  httpClient?: 'axios' | 'fetch';
}
