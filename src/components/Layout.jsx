import { Outlet } from "react-router-dom";
import LandingHeader from "./LandingHeader";

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-muted flex flex-col">
      <LandingHeader />
      <Outlet />
    </div>
  );
}
