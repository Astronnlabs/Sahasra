/**
 * Single entry point for data access. UI code imports from here only.
 * Every call goes to the SAHASRA API server (see /backend), which stores data in PostgreSQL.
 */
export { ApiError, SESSION_EXPIRED_EVENT } from './api/client';
export { authService, type LoginInput, type MePayload, type ServerWorkspace, type SessionInfo } from './api/auth';
export {
  dashboardService,
  reportsService,
  gstService,
  assistantService,
  searchService,
  notificationsService,
  ASSISTANT_SUGGESTIONS,
  type SalesRange,
  type Kpi,
  type SeriesPoint,
  type ReportCategory,
  type ReportData,
  type CellFormat,
  type GstInvoiceRow,
  type AssistantReply,
  type DetailMap,
  type Group,
  type ProfitRow,
} from './api/analytics';
export { productsService, catalogServicesService, packagesService, jobCardsService, customersService, vendorsService, type ProductInput, type PackageInput, type JobCardInput, type PartyPayment, type PaymentInput } from './api/catalog';
export { salesService, billStaffService, type BillStaff, purchasesService, expensesService, inventoryService, uploadsService, EXPENSE_CATEGORIES, type CheckoutInput, type PurchaseInput, type ExpenseInput } from './api/transactions';
export { ebillingService, type EBillingState, type BillMessageRow, type TemplateStatus, type VaahakAccount } from './api/ebilling';
export { employeesService, type AttendanceRow, type EmployeeWithToday } from './api/people';
export { restaurantService, hotelService, salonService, jewelleryService, pharmacyService } from './api/industry';
export {
  usersService,
  rolesService,
  auditService,
  ticketsService,
  workspaceService,
  preferencesService,
  billTemplatesService,
  heldBillsService,
  kotDesignService,
  referralsService,
  importService,
  type ImportResult,
  type KotDesign,
  type Referral,
  type ReferralInput,
  type ReferralStatus,
  type WorkspaceDetails,
  type ProfileInput,
  type StoredTemplate,
  type HeldBill,
} from './api/admin';
export {
  tenantsService,
  platformUsersService,
  platformAdminsService,
  platformTicketsService,
  platformStatsService,
  type NewTenantInput,
  type TenantDetailsInput,
  type OwnerLogin,
  type PlatformAdmin,
  type PlatformOverview,
  type GrowthRange,
} from './api/platform';
