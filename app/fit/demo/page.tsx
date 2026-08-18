import { redirect } from "next/navigation";

/** Canonicalizes the short demo route to the controlled results surface. */
export default function FitDemoPage(): never {
  redirect("/fit/demo/results?tier=fits");
}
