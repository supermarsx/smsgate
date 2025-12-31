/**
 * @fileoverview Root route redirector for smsgate2.
 */

import { redirect } from "next/navigation";

/**
 * Redirect root to the login page.
 * @returns Never resolves; triggers Next.js redirect.
 */
export default function HomePage() {
  redirect("/login");
}
