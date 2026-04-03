import { RouterProvider } from "react-router";
import { router } from "./routes";
import { RbacProvider } from "../lib/rbac/RbacContext";
import { Toaster } from "sonner";

export default function App() {
  return (
    <RbacProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </RbacProvider>
  );
}
