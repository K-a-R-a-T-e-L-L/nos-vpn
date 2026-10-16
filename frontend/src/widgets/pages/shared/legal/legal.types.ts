export type LegalLink = {
  label: string;
  href: string;
};

export type LegalSection = {
  title: string;
  paragraphs: string[];
  items?: string[];
  links?: LegalLink[];
};

export type LegalPageData = {
  eyebrow: string;
  title: string;
  intro: string;
  revision?: string;
  sections: LegalSection[];
};
