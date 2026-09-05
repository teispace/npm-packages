/**
 * Templates for the `layout` generator. Nested layouts only; the root layout
 * is owned by the starter. With i18n the locale comes from root params, so
 * the layout needs nothing beyond `children`.
 */
export interface LayoutTemplateParams {
  componentName: string;
  hasI18n: boolean;
}

export const layoutTemplate = ({ componentName }: LayoutTemplateParams): string =>
  `type Props = {
  children: React.ReactNode;
};

// Layouts do not re-run on client navigation: put session checks in pages
// (\`requireUser\`) and data reads in the components that render them.
export default function ${componentName}({ children }: Props) {
  return <>{children}</>;
}
`;
