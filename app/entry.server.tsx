import type { AppLoadContext, EntryContext } from "react-router";
import type {
  RenderToPipeableStreamOptions,
  RenderToReadableStreamOptions,
} from "react-dom/server";
import { handleRequest as handleVercelRequest } from "@vercel/react-router/entry.server";
import { addDocumentResponseHeaders } from "~/shopify.server";

type RenderOptions = {
  [K in keyof RenderToReadableStreamOptions &
    keyof RenderToPipeableStreamOptions]?: RenderToReadableStreamOptions[K];
};

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext?: AppLoadContext,
  options?: RenderOptions,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  return handleVercelRequest(
    request,
    responseStatusCode,
    responseHeaders,
    routerContext,
    loadContext,
    options,
  );
}
