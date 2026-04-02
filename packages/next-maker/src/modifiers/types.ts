export interface ModifyFileOptions {
  filePath: string;
  content: string;
}

export interface RegisterReducerOptions {
  projectPath: string;
  name: string;
  persist: boolean;
  importPath: string;
}

export interface RegisterApiOptions {
  serviceName: string;
  projectPath: string;
}
