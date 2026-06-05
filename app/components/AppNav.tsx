import { useLocation } from "react-router";

const links = [
  { href: "/app", label: "Home" },
  { href: "/app/promos", label: "Promos" },
  { href: "/app/discount", label: "Discount" },
  { href: "/app/graphql", label: "GraphQL" },
  { href: "/app/settings", label: "Settings" },
];

export function AppNav() {
  const location = useLocation();

  return (
    <s-app-nav>
      {links.map((link) => (
        <s-link
          key={link.href}
          href={link.href}
          aria-current={location.pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </s-link>
      ))}
    </s-app-nav>
  );
}
