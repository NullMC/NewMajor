import { lazy, Suspense } from 'react'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { PublicLayout, ScrollToTop } from '@/components/layout/PublicLayout'
import { PageLoader } from '@/components/ui/Spinner'
import { RequireAdmin, RequireAuth, RequireCustomer } from '@/features/auth/guards'
import { SetupNotice } from './SetupNotice'
import { isSupabaseConfigured } from '@/lib/supabase'

// Pagine pubbliche (code splitting per route)
const HomePage = lazy(() => import('@/features/content/HomePage'))
const CatalogPage = lazy(() => import('@/features/catalog/CatalogPage'))
const ProductPage = lazy(() => import('@/features/catalog/ProductPage'))
const ConfiguratorPage = lazy(() => import('@/features/configurator/ConfiguratorPage'))
const CartPage = lazy(() => import('@/features/cart/CartPage'))
const CheckoutPage = lazy(() => import('@/features/checkout/CheckoutPage'))
const OrderConfirmationPage = lazy(() => import('@/features/checkout/OrderConfirmationPage'))
const AboutPage = lazy(() => import('@/features/content/AboutPage'))
const FaqPage = lazy(() => import('@/features/content/FaqPage'))
const ContactPage = lazy(() => import('@/features/content/ContactPage'))
const CmsPage = lazy(() => import('@/features/content/CmsPage'))
const NotFoundPage = lazy(() => import('@/features/content/NotFoundPage'))
const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/features/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('@/features/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/features/auth/ResetPasswordPage'))

// Area cliente
const AccountLayout = lazy(() => import('@/features/account/AccountLayout'))
const AccountOverview = lazy(() => import('@/features/account/OverviewPage'))
const AccountOrders = lazy(() => import('@/features/account/OrdersPage'))
const AccountOrderDetail = lazy(() => import('@/features/account/OrderDetailPage'))
const AccountNotifications = lazy(() => import('@/features/account/NotificationsPage'))
const AccountProfile = lazy(() => import('@/features/account/ProfilePage'))
const AccountAddresses = lazy(() => import('@/features/account/AddressesPage'))

// Backoffice
const AdminLayout = lazy(() => import('@/features/admin/AdminLayout'))
const AdminLogin = lazy(() => import('@/features/admin/AdminLoginPage'))
const AdminDashboard = lazy(() => import('@/features/admin/DashboardPage'))
const AdminOrders = lazy(() => import('@/features/admin/orders/OrdersPage'))
const AdminOrderDetail = lazy(() => import('@/features/admin/orders/OrderDetailPage'))
const AdminManualOrder = lazy(() => import('@/features/admin/orders/ManualOrderPage'))
const AdminProducts = lazy(() => import('@/features/admin/catalog/ProductsPage'))
const AdminProductEdit = lazy(() => import('@/features/admin/catalog/ProductEditPage'))
const AdminCategories = lazy(() => import('@/features/admin/catalog/CategoriesPage'))
const AdminGarmentTypes = lazy(() => import('@/features/admin/catalog/GarmentTypesPage'))
const AdminAssets = lazy(() => import('@/features/admin/catalog/AssetsPage'))
const AdminContent = lazy(() => import('@/features/admin/content/HomeContentPage'))
const AdminPages = lazy(() => import('@/features/admin/content/PagesPage'))
const AdminPageEdit = lazy(() => import('@/features/admin/content/PageEditPage'))
const AdminFaqs = lazy(() => import('@/features/admin/content/FaqsPage'))
const AdminPortfolio = lazy(() => import('@/features/admin/content/PortfolioPage'))
const AdminMedia = lazy(() => import('@/features/admin/content/MediaPage'))
const AdminUsers = lazy(() => import('@/features/admin/users/UsersPage'))
const AdminUserDetail = lazy(() => import('@/features/admin/users/UserDetailPage'))
const AdminNotifications = lazy(() => import('@/features/admin/comms/NotificationsPage'))
const AdminReminders = lazy(() => import('@/features/admin/comms/RemindersPage'))
const AdminContacts = lazy(() => import('@/features/admin/comms/ContactRequestsPage'))
const AdminStatuses = lazy(() => import('@/features/admin/settings/StatusesPage'))
const AdminSettings = lazy(() => import('@/features/admin/settings/SettingsPage'))
const AdminAudit = lazy(() => import('@/features/admin/settings/AuditLogPage'))
const AdminAccount = lazy(() => import('@/features/admin/AccountPage'))

function Root() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'catalogo', element: <CatalogPage /> },
          { path: 'catalogo/:categorySlug', element: <CatalogPage /> },
          { path: 'prodotti/:slug', element: <ProductPage /> },
          { path: 'prodotti/:slug/personalizza', element: <ConfiguratorPage /> },
          { path: 'carrello', element: <CartPage /> },
          { path: 'checkout', element: <RequireAuth><CheckoutPage /></RequireAuth> },
          { path: 'ordine-confermato/:id', element: <RequireAuth><OrderConfirmationPage /></RequireAuth> },
          { path: 'chi-siamo', element: <AboutPage /> },
          { path: 'faq', element: <FaqPage /> },
          { path: 'contatti', element: <ContactPage /> },
          { path: 'accedi', element: <LoginPage /> },
          { path: 'registrati', element: <RegisterPage /> },
          { path: 'password-dimenticata', element: <ForgotPasswordPage /> },
          { path: 'reimposta-password', element: <ResetPasswordPage /> },
          {
            path: 'account',
            element: <RequireCustomer><AccountLayout /></RequireCustomer>,
            children: [
              { index: true, element: <AccountOverview /> },
              { path: 'ordini', element: <AccountOrders /> },
              { path: 'ordini/:id', element: <AccountOrderDetail /> },
              { path: 'notifiche', element: <AccountNotifications /> },
              { path: 'profilo', element: <AccountProfile /> },
              { path: 'indirizzi', element: <AccountAddresses /> },
            ],
          },
          { path: ':slug', element: <CmsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: 'admin/accedi', element: <AdminLogin /> },
      {
        path: 'admin',
        element: <RequireAdmin><AdminLayout /></RequireAdmin>,
        children: [
          { index: true, element: <AdminDashboard /> },
          { path: 'ordini', element: <AdminOrders /> },
          { path: 'ordini/nuovo', element: <AdminManualOrder /> },
          { path: 'ordini/:id', element: <AdminOrderDetail /> },
          { path: 'prodotti', element: <AdminProducts /> },
          { path: 'prodotti/:id', element: <AdminProductEdit /> },
          { path: 'categorie', element: <AdminCategories /> },
          { path: 'tipologie', element: <AdminGarmentTypes /> },
          { path: 'libreria', element: <AdminAssets /> },
          { path: 'contenuti', element: <AdminContent /> },
          { path: 'pagine', element: <AdminPages /> },
          { path: 'pagine/:id', element: <AdminPageEdit /> },
          { path: 'faq', element: <AdminFaqs /> },
          { path: 'portfolio', element: <AdminPortfolio /> },
          { path: 'media', element: <AdminMedia /> },
          { path: 'utenti', element: <AdminUsers /> },
          { path: 'utenti/:id', element: <AdminUserDetail /> },
          { path: 'notifiche', element: <AdminNotifications /> },
          { path: 'promemoria', element: <AdminReminders /> },
          { path: 'richieste', element: <AdminContacts /> },
          { path: 'stati', element: <AdminStatuses /> },
          { path: 'impostazioni', element: <AdminSettings /> },
          { path: 'registro', element: <AdminAudit /> },
          { path: 'account', element: <AdminAccount /> },
        ],
      },
    ],
  },
])

export function App() {
  if (!isSupabaseConfigured) return <SetupNotice />
  return <RouterProvider router={router} />
}
