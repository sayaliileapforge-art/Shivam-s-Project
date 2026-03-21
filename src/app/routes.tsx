import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Clients } from "./pages/Clients";
import { AddClient } from "./pages/AddClient";
import { ClientProfile } from "./pages/ClientProfile";
import { Products } from "./pages/Products";
import { Projects } from "./pages/Projects";
import { ProjectDetail } from "./pages/ProjectDetail";
import { PrintOrders } from "./pages/PrintOrders";
import { Production } from "./pages/Production";
import { DesignerStudio } from "./pages/DesignerStudio";
import { DataProcessing } from "./pages/DataProcessing";
import { Complaints } from "./pages/Complaints";
import { Finance } from "./pages/Finance";
import { Staff } from "./pages/Staff";
import { Reports } from "./pages/Reports";
import { RoleManagement } from "./pages/RoleManagement";
import { Settings } from "./pages/Settings";
import { ProjectTask } from "./pages/ProjectTask";
import { Unauthorized } from "./pages/Unauthorized";
import { VariableDataWorkflow } from "./pages/VariableDataWorkflow";
import { DirectPrintWorkflow } from "./pages/DirectPrintWorkflow";
import { Login } from "./pages/Login";
import { ProductTemplateSelection } from "./pages/ProductTemplateSelection";
import { TemplateOrderPage } from "./pages/TemplateOrderPage";
import { TemplateGallery } from "./pages/TemplateGallery";
import DataMigration from "./pages/DataMigration";
import { RouteGuard } from "../lib/rbac";
import { Permission } from "../lib/rbac";

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: Layout,
    children: [
      // Dashboard — accessible to all authenticated users
      { index: true, Component: Dashboard },

      // Clients
      {
        path: "clients",
        children: [
          {
            index: true,
            element: (
              <RouteGuard anyOf={[Permission.CLIENTS__VIEW, Permission.CLIENTS__MANAGE]}>
                <Clients />
              </RouteGuard>
            ),
          },
          {
            path: "add",
            element: (
              <RouteGuard anyOf={[Permission.CLIENTS__CREATE, Permission.CLIENTS__MANAGE]}>
                <AddClient />
              </RouteGuard>
            ),
          },
          {
            path: ":id",
            element: (
              <RouteGuard anyOf={[Permission.CLIENTS__VIEW, Permission.CLIENTS__MANAGE]}>
                <ClientProfile />
              </RouteGuard>
            ),
          },
        ],
      },

      // Products / Catalogue
      {
        path: "products",
        element: (
          <RouteGuard anyOf={[Permission.PRODUCTS__VIEW, Permission.PRODUCTS__MANAGE_CATALOG]}>
            <Products />
          </RouteGuard>
        ),
      },
      {
        path: "products/:productId/templates",
        element: (
          <RouteGuard anyOf={[Permission.PRODUCTS__VIEW, Permission.PRODUCTS__MANAGE_CATALOG]}>
            <ProductTemplateSelection />
          </RouteGuard>
        ),
      },
      {
        path: "products/:productId/order",
        element: (
          <RouteGuard anyOf={[Permission.ORDERS__VIEW, Permission.ORDERS__MANAGE, Permission.PRODUCTS__VIEW]}>
            <TemplateOrderPage />
          </RouteGuard>
        ),
      },

      // Projects
      {
        path: "projects",
        element: (
          <RouteGuard anyOf={[Permission.PROJECTS__VIEW_ALL, Permission.PROJECTS__VIEW_ASSIGNED]}>
            <Projects />
          </RouteGuard>
        ),
      },
      {
        path: "projects/:id",
        element: (
          <RouteGuard anyOf={[Permission.PROJECTS__VIEW_ALL, Permission.PROJECTS__VIEW_ASSIGNED]}>
            <ProjectDetail />
          </RouteGuard>
        ),
      },

      // Project Tasks
      {
        path: "project-tasks",
        element: (
          <RouteGuard anyOf={[Permission.PROJECTS__VIEW_ALL, Permission.PROJECTS__VIEW_ASSIGNED]}>
            <ProjectTask />
          </RouteGuard>
        ),
      },

      // Print Orders
      {
        path: "print-orders",
        element: (
          <RouteGuard anyOf={[Permission.ORDERS__VIEW, Permission.ORDERS__MANAGE]}>
            <PrintOrders />
          </RouteGuard>
        ),
      },

      // Variable Data Printing Workflow
      {
        path: "workflows/variable-data",
        element: (
          <RouteGuard anyOf={[Permission.ORDERS__VIEW, Permission.ORDERS__MANAGE]}>
            <VariableDataWorkflow />
          </RouteGuard>
        ),
      },

      // Direct Print Order Workflow
      {
        path: "workflows/direct-print",
        element: (
          <RouteGuard anyOf={[Permission.ORDERS__VIEW, Permission.ORDERS__MANAGE]}>
            <DirectPrintWorkflow />
          </RouteGuard>
        ),
      },

      // Production
      {
        path: "production",
        element: (
          <RouteGuard anyOf={[Permission.PRODUCTION__VIEW_APPROVED, Permission.PRODUCTION__MANAGE_BATCHES]}>
            <Production />
          </RouteGuard>
        ),
      },

      // Designer Studio
      {
        path: "designer-studio",
        element: (
          <RouteGuard anyOf={[Permission.DESIGN__ACCESS_STUDIO, Permission.DESIGN__CREATE_EDIT_TEMPLATES]}>
            <DesignerStudio />
          </RouteGuard>
        ),
      },

      // Public Template Gallery
      {
        path: "template-gallery",
        element: (
          <RouteGuard anyOf={[Permission.DESIGN__ACCESS_STUDIO, Permission.DESIGN__CREATE_EDIT_TEMPLATES]}>
            <TemplateGallery />
          </RouteGuard>
        ),
      },

      // Data Processing
      {
        path: "data-processing",
        element: (
          <RouteGuard anyOf={[Permission.DATA__UPLOAD_EXCEL, Permission.DATA__MAP_COLUMNS, Permission.DATA__VALIDATE_RECORDS]}>
            <DataProcessing />
          </RouteGuard>
        ),
      },

      // Complaints — any user who can view clients may raise/view complaints
      {
        path: "complaints",
        element: (
          <RouteGuard anyOf={[Permission.CLIENTS__VIEW, Permission.CLIENTS__MANAGE]}>
            <Complaints />
          </RouteGuard>
        ),
      },

      // Finance / Wallet
      {
        path: "finance",
        element: (
          <RouteGuard anyOf={[Permission.WALLET__VIEW, Permission.WALLET__MANAGE]}>
            <Finance />
          </RouteGuard>
        ),
      },

      // Staff
      {
        path: "staff",
        element: (
          <RouteGuard anyOf={[Permission.STAFF__VIEW, Permission.STAFF__MANAGE]}>
            <Staff />
          </RouteGuard>
        ),
      },

      // Reports
      {
        path: "reports",
        element: (
          <RouteGuard
            anyOf={[
              Permission.REPORTS__PLATFORM,
              Permission.REPORTS__VENDOR,
              Permission.REPORTS__SALES,
              Permission.REPORTS__FINANCIAL,
              Permission.REPORTS__PRODUCTION,
            ]}
          >
            <Reports />
          </RouteGuard>
        ),
      },

      // Role Management — platform admin only
      {
        path: "roles",
        element: (
          <RouteGuard anyOf={[Permission.PLATFORM__MANAGE_ROLES]}>
            <RoleManagement />
          </RouteGuard>
        ),
      },

      // Settings — platform config
      {
        path: "settings",
        element: (
          <RouteGuard anyOf={[Permission.PLATFORM__CONFIGURE, Permission.VENDORS__MANAGE]}>
            <Settings />
          </RouteGuard>
        ),
      },

      // Data Migration — move data to MongoDB
      {
        path: "migrate-data",
        Component: DataMigration,
      },

      // Unauthorized fallback
      { path: "unauthorized", Component: Unauthorized },
    ],
  },
]);