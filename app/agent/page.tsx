import { redirect } from "next/navigation";

export default async function AgentPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly job?: string | readonly string[] }>;
}): Promise<never> {
  const resolved = await searchParams;
  const job = Array.isArray(resolved.job) ? resolved.job[0] : resolved.job;
  redirect(job === undefined ? "/fit" : `/fit?job=${encodeURIComponent(job)}`);
}
