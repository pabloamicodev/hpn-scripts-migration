import type React from "react";

type ShopifyElementProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
>;

type ShopifyLinkProps = ShopifyElementProps & {
  href?: string;
  rel?: string;
  target?: string;
  "aria-current"?: "page" | undefined;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": ShopifyElementProps;
      "s-link": ShopifyLinkProps;
    }
  }
}

export {};
