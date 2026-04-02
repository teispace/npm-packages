export const componentTemplate = (params: { componentName: string; hookName: string }): string => {
  const { componentName, hookName } = params;
  return `'use client';
import { ${hookName} } from '../hooks/${hookName}';

export function ${componentName}() {
  const {} = ${hookName}();

  return (
    <div>
      <h2>${componentName} Component</h2>
      {/* Add your component UI here */}
    </div>
  );
}

export default ${componentName};
`;
};
