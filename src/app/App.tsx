import { RouterProvider } from "react-router";
import { router } from "./routes";
import { RbacProvider } from "../lib/rbac/RbacContext";

export default function App() {
  return (
    <RbacProvider>
      <RouterProvider router={router} />
    </RbacProvider>
  );
}
