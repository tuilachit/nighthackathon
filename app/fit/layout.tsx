import { FitJourneyProvider } from "@/components/fit/journey/FitJourneyProvider";

export default function FitLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <div className="fit-instrument">
      <FitJourneyProvider>{children}</FitJourneyProvider>
    </div>
  );
}
