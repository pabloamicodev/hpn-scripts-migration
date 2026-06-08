import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { guardGraphQLConsole } from "~/lib/guards.server";
import { authenticate } from "~/shopify.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  guardGraphQLConsole();

  return json({ error: "Use POST to execute GraphQL queries." }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  guardGraphQLConsole();

  const { admin } = await authenticate.admin(request);

  let body: { query?: string; variables?: Record<string, unknown> };

  try {
    body = (await request.json()) as {
      query?: string;
      variables?: Record<string, unknown>;
    };
  } catch {
    return json({ errors: [{ message: "Invalid JSON request body." }] }, { status: 400 });
  }

  if (!body.query?.trim()) {
    return json({ errors: [{ message: "Query is required." }] }, { status: 400 });
  }

  try {
    const response = await admin.graphql(body.query, {
      variables: body.variables ?? {},
    });
    const result = await response.json();

    return json(result, { status: response.status });
  } catch (error) {
    return json(
      {
        errors: [
          {
            message:
              error instanceof Error ? error.message : "GraphQL request failed.",
          },
        ],
      },
      { status: 500 },
    );
  }
}
