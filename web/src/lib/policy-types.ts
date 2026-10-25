export interface Policy {
  slug: string;
  title: string;
  summary: string;
  body: string;
  version: string;
  published: boolean;
  showOnCert: boolean;
  builtin: boolean;
  updatedAt: string;
}
