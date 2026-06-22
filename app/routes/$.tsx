import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";

export async function loader({ request: _request }: LoaderFunctionArgs) {
  throw data("Not Found", { status: 404 });
}
