import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { AuthProvider } from "./providers/AuthProvider";
import { QueryProvider } from "./providers/QueryProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ChannelListPage from "./pages/ChannelListPage";
import ChannelDetailPage from "./pages/ChannelDetailPage";
import ChannelImportPage from "./pages/ChannelImportPage";
import VideoListPage from "./pages/VideoListPage";
import VideoDetailPage from "@/pages/VideoDetailPage";
import MiscPage from "@/pages/MiscPage";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: <ProtectedRoute><Layout /></ProtectedRoute>,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "channels", element: <ChannelListPage /> },
      { path: "channels/import", element: <ChannelImportPage /> },
      { path: "channels/:id", element: <ChannelDetailPage /> },
      { path: "videos", element: <VideoListPage /> },
      { path: "videos/:id", element: <VideoDetailPage /> },
      { path: "misc", element: <MiscPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
