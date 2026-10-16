import NextLink, { type LinkProps as NextLinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof NextLinkProps | "href"> &
  NextLinkProps & {
    children?: ReactNode;
    locale?: string;
  };

export function Link({ locale, ...props }: LinkProps) {
  void locale;
  return <NextLink {...props} />;
}

export function getPathname({ href }: { href: string }) {
  return href;
}
