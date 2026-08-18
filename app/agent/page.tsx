import { redirect } from "next/navigation";
import { resolveAgentEntry } from "@/lib/fit-route-contract";

export default async function AgentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly job?: string | readonly string[] }>;
}): Promise<never> {
  redirect(resolveAgentEntry(await searchParams));
}
