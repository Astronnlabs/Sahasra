import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { FullScreenLoader } from '@/components/feedback/PageSkeleton';
import { AppLayout } from '@/components/layout/AppLayout';
import { GuestRoute, PlanRoute, ProtectedRoute, SuperAdminRoute } from './ProtectedRoute';

/** Route-level code splitting for named page exports. */
const page = <T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(async () => ({ default: (await loader())[name] as ComponentType }));

const LoginPage = page(() => import('@/features/auth/LoginPage'), 'LoginPage');
const SetupPage = page(() => import('@/features/auth/SetupPage'), 'SetupPage');
const SignupPage = page(() => import('@/features/auth/SignupPage'), 'SignupPage');
const SubscriptionPage = page(() => import('@/features/subscription/SubscriptionPage'), 'SubscriptionPage');
const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const DashboardDetailPage = page(() => import('@/features/dashboard/DashboardDetailPage'), 'DashboardDetailPage');
const PosPage = page(() => import('@/features/pos/PosPage'), 'PosPage');
const SalesPage = page(() => import('@/features/sales/SalesPage'), 'SalesPage');
const PurchasesPage = page(() => import('@/features/purchases/PurchasesPage'), 'PurchasesPage');
const NewPurchasePage = page(() => import('@/features/purchases/NewPurchasePage'), 'NewPurchasePage');
const InventoryPage = page(() => import('@/features/inventory/InventoryPage'), 'InventoryPage');
const ProductsPage = page(() => import('@/features/products/ProductsPage'), 'ProductsPage');
const ServicesPage = page(() => import('@/features/services/ServicesPage'), 'ServicesPage');
const PackagesPage = page(() => import('@/features/packages/PackagesPage'), 'PackagesPage');
const JobCardsPage = page(() => import('@/features/job-cards/JobCardsPage'), 'JobCardsPage');
const CustomersPage = page(() => import('@/features/customers/CustomersPage'), 'CustomersPage');
const CustomerProfilePage = page(() => import('@/features/customers/CustomerProfilePage'), 'CustomerProfilePage');
const VendorsPage = page(() => import('@/features/vendors/VendorsPage'), 'VendorsPage');
const VendorProfilePage = page(() => import('@/features/vendors/VendorProfilePage'), 'VendorProfilePage');
const ExpensesPage = page(() => import('@/features/expenses/ExpensesPage'), 'ExpensesPage');
const EmployeesPage = page(() => import('@/features/employees/EmployeesPage'), 'EmployeesPage');
const EmployeeProfilePage = page(() => import('@/features/employees/EmployeeProfilePage'), 'EmployeeProfilePage');
const AttendancePage = page(() => import('@/features/employees/AttendancePage'), 'AttendancePage');
const PayrollPage = page(() => import('@/features/payroll/PayrollPage'), 'PayrollPage');
const GstPage = page(() => import('@/features/gst/GstPage'), 'GstPage');
const ReportsPage = page(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const TablesPage = page(() => import('@/features/restaurant/TablesPage'), 'TablesPage');
const OrdersPage = page(() => import('@/features/restaurant/OrdersPage'), 'OrdersPage');
const KitchenPage = page(() => import('@/features/restaurant/KitchenPage'), 'KitchenPage');
const RoomsPage = page(() => import('@/features/hotel/RoomsPage'), 'RoomsPage');
const ReservationsPage = page(() => import('@/features/hotel/ReservationsPage'), 'ReservationsPage');
const AppointmentsPage = page(() => import('@/features/salon/AppointmentsPage'), 'AppointmentsPage');
const JewelleryPage = page(() => import('@/features/jewellery/JewelleryPage'), 'JewelleryPage');
const MedicinesPage = page(() => import('@/features/pharmacy/MedicinesPage'), 'MedicinesPage');
const BillStudioPage = page(() => import('@/features/bill-studio/BillStudioPage'), 'BillStudioPage');
const UsersPage = page(() => import('@/features/users/UsersPage'), 'UsersPage');
const RolesPage = page(() => import('@/features/users/RolesPage'), 'RolesPage');
const NotificationsPage = page(() => import('@/features/users/NotificationsPage'), 'NotificationsPage');
const AuditLogsPage = page(() => import('@/features/users/AuditLogsPage'), 'AuditLogsPage');
const SettingsPage = page(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const NotFoundPage = page(() => import('@/pages/NotFoundPage'), 'NotFoundPage');
const SupportPage = page(() => import('@/features/support/SupportPage'), 'SupportPage');
const SuperAdminLayout = page(() => import('@/features/superadmin/SuperAdminLayout'), 'SuperAdminLayout');
const SAOverviewPage = page(() => import('@/features/superadmin/OverviewPage'), 'OverviewPage');
const SABusinessesPage = page(() => import('@/features/superadmin/BusinessesPage'), 'BusinessesPage');
const SABusinessFormPage = page(() => import('@/features/superadmin/BusinessFormPage'), 'BusinessFormPage');
const SABusinessDetailPage = page(() => import('@/features/superadmin/BusinessDetailPage'), 'BusinessDetailPage');
const SAUsersPage = page(() => import('@/features/superadmin/PlatformUsersPage'), 'PlatformUsersPage');
const SASupportPage = page(() => import('@/features/superadmin/SupportInboxPage'), 'SupportInboxPage');
const SAGrowthPage = page(() => import('@/features/superadmin/GrowthPage'), 'GrowthPage');
const SAReferralsPage = page(() => import('@/features/superadmin/ReferralsPage'), 'ReferralsPage');

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/login" replace /> },
  {
    path: '/login',
    element: (
      <GuestRoute>
        <Suspense fallback={<FullScreenLoader />}>
          <LoginPage />
        </Suspense>
      </GuestRoute>
    ),
  },
  {
    path: '/signup',
    element: (
      <GuestRoute>
        <Suspense fallback={<FullScreenLoader />}>
          <SignupPage />
        </Suspense>
      </GuestRoute>
    ),
  },
  {
    path: '/subscription',
    element: (
      <PlanRoute>
        <Suspense fallback={<FullScreenLoader />}>
          <SubscriptionPage />
        </Suspense>
      </PlanRoute>
    ),
  },
  {
    path: '/setup',
    element: (
      <GuestRoute>
        <Suspense fallback={<FullScreenLoader />}>
          <SetupPage />
        </Suspense>
      </GuestRoute>
    ),
  },
  {
    path: '/superadmin',
    element: (
      <SuperAdminRoute>
        <Suspense fallback={<FullScreenLoader />}>
          <SuperAdminLayout />
        </Suspense>
      </SuperAdminRoute>
    ),
    children: [
      { index: true, element: <SAOverviewPage /> },
      { path: 'businesses', element: <SABusinessesPage /> },
      { path: 'businesses/new', element: <SABusinessFormPage /> },
      { path: 'businesses/:id', element: <SABusinessDetailPage /> },
      { path: 'businesses/:id/edit', element: <SABusinessFormPage /> },
      { path: 'users', element: <SAUsersPage /> },
      { path: 'support', element: <SASupportPage /> },
      { path: 'growth', element: <SAGrowthPage /> },
      { path: 'referrals', element: <SAReferralsPage /> },
      { path: '*', element: <Navigate to="/superadmin" replace /> },
    ],
  },
  {
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/dashboard/:kind', element: <DashboardDetailPage /> },
      { path: '/pos', element: <PosPage /> },
      { path: '/sales', element: <SalesPage /> },
      { path: '/purchases', element: <PurchasesPage /> },
      { path: '/purchases/new', element: <NewPurchasePage /> },
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/products', element: <ProductsPage /> },
      { path: '/services', element: <ServicesPage /> },
      { path: '/packages', element: <PackagesPage /> },
      { path: '/job-cards', element: <JobCardsPage /> },
      { path: '/customers', element: <CustomersPage /> },
      { path: '/customers/:id', element: <CustomerProfilePage /> },
      { path: '/vendors', element: <VendorsPage /> },
      { path: '/vendors/:id', element: <VendorProfilePage /> },
      { path: '/expenses', element: <ExpensesPage /> },
      { path: '/employees', element: <EmployeesPage /> },
      { path: '/employees/attendance', element: <AttendancePage /> },
      { path: '/employees/:id', element: <EmployeeProfilePage /> },
      { path: '/payroll', element: <PayrollPage /> },
      { path: '/gst', element: <GstPage /> },
      { path: '/reports', element: <ReportsPage /> },
      { path: '/restaurant', element: <Navigate to="/restaurant/tables" replace /> },
      { path: '/restaurant/tables', element: <TablesPage /> },
      { path: '/restaurant/orders', element: <OrdersPage /> },
      { path: '/restaurant/kitchen', element: <KitchenPage /> },
      { path: '/hotel/rooms', element: <RoomsPage /> },
      { path: '/hotel/reservations', element: <ReservationsPage /> },
      { path: '/salon/appointments', element: <AppointmentsPage /> },
      { path: '/jewellery/items', element: <JewelleryPage /> },
      { path: '/pharmacy/medicines', element: <MedicinesPage /> },
      { path: '/bill-studio', element: <BillStudioPage /> },
      { path: '/users', element: <UsersPage /> },
      { path: '/roles', element: <RolesPage /> },
      { path: '/notifications', element: <NotificationsPage /> },
      { path: '/audit-logs', element: <AuditLogsPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/support', element: <SupportPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
], {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});

export function AppRouter() {
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
}
