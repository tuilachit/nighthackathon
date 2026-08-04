export default function FitLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return <div className="fit-instrument">{children}</div>;
}
