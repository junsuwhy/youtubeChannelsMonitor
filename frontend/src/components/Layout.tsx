import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";

export function Layout() {
  const { logout } = useAuth();
  const location = useLocation();

  const links = [
    { to: "/", label: "Dashboard" },
    { to: "/channels", label: "Channels" },
    { to: "/videos", label: "Videos" },
    { to: "/channels/import", label: "Import" },
  ];

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50">
      <aside className="w-64 flex flex-col border-r bg-white dark:bg-zinc-950">
        <div className="h-16 flex items-center px-6 border-b font-bold text-lg">
          YT Monitor
        </div>
        <nav className="flex-1 px-4 py-6 space-y-2">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`block px-4 py-2 rounded-md transition-colors ${
                  isActive 
                    ? "bg-zinc-100 dark:bg-zinc-800 font-medium" 
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t">
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-sm text-left text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors dark:text-zinc-400 dark:hover:text-zinc-50 dark:hover:bg-zinc-800"
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <div className="h-16 border-b bg-white dark:bg-zinc-950 flex items-center px-8">
          <h1 className="font-semibold">{links.find(l => l.to === location.pathname)?.label || "Dashboard"}</h1>
        </div>
        <div className="flex-1 p-8 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}