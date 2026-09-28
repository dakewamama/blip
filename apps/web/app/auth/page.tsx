import { Suspense } from "react";
import AuthFlow from "./AuthFlow";

export const metadata = { title: "blip \u2014 create your account" };

export default function AuthPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh" }} />}>
      <AuthFlow />
    </Suspense>
  );
}
