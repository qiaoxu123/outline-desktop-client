import { Outlet } from "react-router-dom";
import Sidebar from "../sidebar/Sidebar";
import TitleBar from "./TitleBar";
import { useUIStore } from "../../state/uiStore";
import "./AppShell.css";

export default function AppShell(): React.ReactElement {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        {!sidebarCollapsed && (
          <aside className="app-sidebar">
            <Sidebar />
          </aside>
        )}
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
