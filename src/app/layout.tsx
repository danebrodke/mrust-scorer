import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mRUST Scorer",
  description: "Score tibia fracture radiographs on the modified RUST scale.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
