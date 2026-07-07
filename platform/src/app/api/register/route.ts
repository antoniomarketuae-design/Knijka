import { NextResponse } from "next/server";
import { registerUser } from "@/modules/auth";

/**
 * POST /api/register — thin adapter over modules/auth registerUser().
 * 201 {user} | 400 {error, fieldErrors?} | 409 {error} | 500 {error}
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await registerUser(body);

    if (!result.ok) {
      if (result.error === "email_taken") {
        return NextResponse.json({ error: "email_taken" }, { status: 409 });
      }
      return NextResponse.json(
        { error: "invalid_input", fieldErrors: result.fieldErrors },
        { status: 400 },
      );
    }

    return NextResponse.json({ user: result.user }, { status: 201 });
  } catch (err) {
    console.error("[api/register] failed:", err);
    // Never leak internals (or e-mail existence) in the response body.
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
