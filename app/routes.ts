import { type RouteConfig, route, index } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("app", "routes/app.tsx", [
    index("routes/app._index.tsx"),
    route("promos", "routes/app.promos.tsx"),
    route("promos/new", "routes/app.promos.new.tsx"),
    route("promos/:id", "routes/app.promos.$id.tsx"),
    route("discount", "routes/app.discount.tsx"),
    route("graphql", "routes/app.graphql.tsx"),
    route("settings", "routes/app.settings.tsx"),
  ]),
  route("auth/*", "routes/auth.$.tsx"),
] satisfies RouteConfig;
