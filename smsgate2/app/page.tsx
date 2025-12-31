import { redirect } from "next/navigation";

/**
 * Redirect root to the login page.
 */
export default function HomePage() {
  redirect("/login");
}
