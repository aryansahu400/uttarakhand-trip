import { apiError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Any /api path without its own route: a JSON 404 {error} (instead of the HTML 404 page), for every method. */
const notFound = async () => apiError("Not found — no such API endpoint", 404);

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
