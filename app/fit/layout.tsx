import { Space_Grotesk } from "next/font/google";
import "./fit.css";

const fitDisplay = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fit-display",
  display: "swap",
});

export default function FitLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return <div className={`${fitDisplay.variable} fit-instrument`}>{children}</div>;
}
