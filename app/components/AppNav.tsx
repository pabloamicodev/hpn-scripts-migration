import { useLocation } from "react-router";

const links = [
  { href: "/app", label: "Home", rel: "home" },
  { href: "/app/promos", label: "Promos" },
  { href: "/app/discount", label: "Discount" },
  { href: "/app/discounts-overview", label: "All Discounts" },
  { href: "/app/graphql", label: "GraphQL" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/docs", label: "Docs" },
];

export function AppNav() {
  const location = useLocation();

  return (
    <s-app-nav>
      {links.map((link) => (
        <s-link
          key={link.href}
          href={link.href}
          rel={link.rel}
          aria-current={location.pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </s-link>
      ))}
    </s-app-nav>
  );
}
