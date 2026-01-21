/**
 * DATAVERSE TYPES INDEX - OPTIMIZED FOR AI AGENT CONTEXT
 * 
 * APPLICATION DOMAIN: Purchase, Delivery, Product, and Routing Management System
 * 
 * This is a comprehensive delivery and logistics management system with the following core capabilities:
 * 
 * 🚚 DELIVERY & ROUTING:
 *   - Route Planning: Create optimized delivery routes (PsDeliveryroutes) linking customers, drivers, and vehicles
 *   - Schedule Management: Manage delivery schedules and territories (PsDeliveryschedule, PsTerritorygroup)
 *   - Route Tracking: Track actual vs planned delivery times, distances, and driver performance
 *   - Job Management: Schedule and assign delivery jobs (PsJoblist) to routes and drivers
 * 
 * 📦 PURCHASE ORDER MANAGEMENT:
 *   - Purchase Orders: Create and manage supplier purchase orders (PsPurchaseorder, PsPurchaseorderline)
 *   - Product-Supplier Mapping: Link products to suppliers (PsProductsuppliermapping) for automated ordering
 *   - Receipt Management: Track received goods (PsPurchaseorderreceipt, PsPurchaseorderreceiptline)
 *   - Approval Workflow: Manage purchase order approvals and workflow
 * 
 * 🛒 PRODUCT & INVENTORY:
 *   - Product Catalog: Manage product inventory, specifications, and suppliers (Product)
 *   - Inventory Tracking: Track product availability and minimum quantities
 *   - Supplier Relationships: Link products to suppliers for procurement
 * 
 * 👥 CUSTOMER & STAFF MANAGEMENT:
 *   - Customer Accounts: Manage customer accounts (Account) who receive deliveries
 *   - Staff Management: Manage drivers and operations staff (PsStaff) assigned to routes
 *   - Vehicle Fleet: Manage delivery vehicles (PsVehicledatabase) and their assignments
 * 
 * 📋 SALES ORDER INTEGRATION:
 *   - Sales Orders: Customer orders (Salesorder) trigger delivery requirements
 *   - Order Fulfillment: Delivery routes are created from sales orders
 *   - Line Item Tracking: Track specific products ordered (Salesorderdetail)
 * 
 * KEY ENTITY RELATIONSHIPS:
 *   - Account (Customer) → Salesorder → PsDeliveryroutes (delivery routes for customer orders)
 *   - PsDeliveryroutes → PsStaff (driver), PsVehicledatabase (vehicle), Salesorder (source order)
 *   - Product → PsProductsuppliermapping → PsPurchaseorder (products ordered from suppliers)
 *   - PsPurchaseorder → PsPurchaseorderline (items in purchase order)
 *   - PsJoblist → PsDeliveryroutes (jobs scheduled on routes)
 * 
 * FIELD CATEGORIES (in each entity file):
 * - Primary Key: Unique identifier for the entity
 * - Business Fields: Core business data (prefixed with ps_)
 * - Choice Fields (Option Sets): Fields with predefined choices (documented with option values)
 * - Yes/No Fields (Two Options): Boolean fields with Yes/No labels (documented with true/false values)
 * - Reference Fields (Lookups): Lookup relationships to other entities (GUIDs)
 * - Lookup Display Fields: Display names for lookup fields (auto-generated)
 * - Audit Fields: Created/modified tracking (createdby, modifiedon, etc.)
 * - Ownership Fields: Owner and business unit assignments
 * - System Fields: State, status, and version tracking
 * - Relationships: Navigation properties to related entities
 * 
 * AVAILABLE ENTITIES (23 total):
 * 
 * DELIVERY & ROUTING:
 *   1. PsDeliveryroutes - Delivery Route - Represents a scheduled delivery stop/route linking customers, drivers, vehicles, and sales orders
 *   2. PsDeliveryschedule - Delivery Schedule - Defines delivery schedules and territories for managing recurring routes
 *   3. PsJobassetattachment - Job Asset Attachment - Attachments and assets related to delivery jobs
 *   4. PsPostalareaboundary - Postal Area Boundary - Geographic boundaries for territory management
 *   5. PsRelatedasset - Related Asset - Assets and equipment related to deliveries
 *   6. PsTerritorygroup - Territory Group - Groups territories for organizing routes by regions
 *   7. PsJoblist - Job List - Delivery jobs that need to be scheduled and routed
 * 
 * PURCHASE ORDER MANAGEMENT:
 *   1. PsProductsuppliermapping - Product Supplier Mapping - Maps products to suppliers for ordering
 *   2. PsPurchaseorder - Purchase Order - Orders from suppliers to restock inventory
 *   3. PsPurchaseorderline - Purchase Order Line - Line items in purchase orders
 *   4. PsPurchaseorderreceipt - Purchase Order Receipt - Receipt records for received orders
 *   5. PsPurchaseorderreceiptline - PO Receipt Line - Line items in purchase order receipts
 *   6. PsPurchaseorderreportgenerationrequest - PO Report Request - Request to generate reports
 * 
 * PRODUCT & SALES:
 *   1. Salesorder - Sales Order - Customer orders that trigger delivery requirements
 *   2. Salesorderdetail - Sales Order Detail - Line items within sales orders specifying products and quantities
 *   3. Product - Product - Catalog of products with inventory, suppliers, and specifications
 *   4. PsPurchaseorder - Purchase Order - Orders from suppliers to restock inventory
 *   5. PsPurchaseorderline - Purchase Order Line - Line items in purchase orders
 *   6. PsPurchaseorderreceipt - Purchase Order Receipt - Receipt records for received orders
 *   7. PsPurchaseorderreceiptline - PO Receipt Line - Line items in purchase order receipts
 *   8. PsPurchaseorderreportgenerationrequest - PO Report Request - Request to generate reports
 * 
 * CUSTOMER & STAFF MANAGEMENT:
 *   1. PsVehicledatabase - Vehicle Database - Fleet management tracking vehicles assigned to routes
 *   2. Account - Account - Customers who receive deliveries and supplier accounts for purchase orders
 *   3. PsStaff - Staff - Employees including drivers and managers assigned to routes
 *   4. Aaduser - Azure AD User - Microsoft Entra ID accounts linked to staff
 * 
 * SYSTEM:
 *   1. PsSetting - Application Settings - Configuration settings for the system
 *   2. PsAppfeature - Application Feature - Feature flags and configuration
 *   3. PsPoreportgenerationrequest - PO Report Request - Request to generate purchase order reports
 * 
 * USAGE EXAMPLES:
 * 
 * // Import from index (recommended for multiple types)
 * import type { PsDeliveryroutes, PsDeliveryroutesCreate } from '@/types/dataverse'
 * import { psdeliveryroutesEntitySet, EntitySets } from '@/types/dataverse'
 * 
 * // Import from individual file (better for tree-shaking)
 * import type { PsDeliveryroutes } from '@/types/dataverse/PsDeliveryroutes'
 * 
 * // Create a new record
 * const newRoute: PsDeliveryroutesCreate = {
 *   ps_routename: 'Morning Route',
 *   ps_route_date: '2026-01-20',
 *   ps_driver: 'staff-guid-here',
 * }
 * 
 * GENERATED ON: 2026-01-21T03:03:52.369Z
 * This file is automatically generated. Do not edit manually.
 */

export type { PsDeliveryroutes, PsDeliveryroutesCreate, PsDeliveryroutesUpdate, PsDeliveryroutesSelect, PsDeliveryroutesExpand, PsDeliveryroutesEntitySet } from './PsDeliveryroutes.js'
export type { PsDeliveryschedule, PsDeliveryscheduleCreate, PsDeliveryscheduleUpdate, PsDeliveryscheduleSelect, PsDeliveryscheduleExpand, PsDeliveryscheduleEntitySet } from './PsDeliveryschedule.js'
export type { PsJobassetattachment, PsJobassetattachmentCreate, PsJobassetattachmentUpdate, PsJobassetattachmentSelect, PsJobassetattachmentExpand, PsJobassetattachmentEntitySet } from './PsJobassetattachment.js'
export type { Salesorder, SalesorderCreate, SalesorderUpdate, SalesorderSelect, SalesorderExpand, SalesorderEntitySet } from './Salesorder.js'
export type { Salesorderdetail, SalesorderdetailCreate, SalesorderdetailUpdate, SalesorderdetailSelect, SalesorderdetailExpand, SalesorderdetailEntitySet } from './Salesorderdetail.js'
export type { PsPostalareaboundary, PsPostalareaboundaryCreate, PsPostalareaboundaryUpdate, PsPostalareaboundarySelect, PsPostalareaboundaryExpand, PsPostalareaboundaryEntitySet } from './PsPostalareaboundary.js'
export type { PsRelatedasset, PsRelatedassetCreate, PsRelatedassetUpdate, PsRelatedassetSelect, PsRelatedassetExpand, PsRelatedassetEntitySet } from './PsRelatedasset.js'
export type { PsSetting, PsSettingCreate, PsSettingUpdate, PsSettingSelect, PsSettingExpand, PsSettingEntitySet } from './PsSetting.js'
export type { PsTerritorygroup, PsTerritorygroupCreate, PsTerritorygroupUpdate, PsTerritorygroupSelect, PsTerritorygroupExpand, PsTerritorygroupEntitySet } from './PsTerritorygroup.js'
export type { PsVehicledatabase, PsVehicledatabaseCreate, PsVehicledatabaseUpdate, PsVehicledatabaseSelect, PsVehicledatabaseExpand, PsVehicledatabaseEntitySet } from './PsVehicledatabase.js'
export type { Product, ProductCreate, ProductUpdate, ProductSelect, ProductExpand, ProductEntitySet } from './Product.js'
export type { Account, AccountCreate, AccountUpdate, AccountSelect, AccountExpand, AccountEntitySet } from './Account.js'
export type { PsStaff, PsStaffCreate, PsStaffUpdate, PsStaffSelect, PsStaffExpand, PsStaffEntitySet } from './PsStaff.js'
export type { PsAppfeature, PsAppfeatureCreate, PsAppfeatureUpdate, PsAppfeatureSelect, PsAppfeatureExpand, PsAppfeatureEntitySet } from './PsAppfeature.js'
export type { PsJoblist, PsJoblistCreate, PsJoblistUpdate, PsJoblistSelect, PsJoblistExpand, PsJoblistEntitySet } from './PsJoblist.js'
export type { Aaduser, AaduserCreate, AaduserUpdate, AaduserSelect, AaduserExpand, AaduserEntitySet } from './Aaduser.js'
export type { PsPoreportgenerationrequest, PsPoreportgenerationrequestCreate, PsPoreportgenerationrequestUpdate, PsPoreportgenerationrequestSelect, PsPoreportgenerationrequestExpand, PsPoreportgenerationrequestEntitySet } from './PsPoreportgenerationrequest.js'
export type { PsProductsuppliermapping, PsProductsuppliermappingCreate, PsProductsuppliermappingUpdate, PsProductsuppliermappingSelect, PsProductsuppliermappingExpand, PsProductsuppliermappingEntitySet } from './PsProductsuppliermapping.js'
export type { PsPurchaseorder, PsPurchaseorderCreate, PsPurchaseorderUpdate, PsPurchaseorderSelect, PsPurchaseorderExpand, PsPurchaseorderEntitySet } from './PsPurchaseorder.js'
export type { PsPurchaseorderline, PsPurchaseorderlineCreate, PsPurchaseorderlineUpdate, PsPurchaseorderlineSelect, PsPurchaseorderlineExpand, PsPurchaseorderlineEntitySet } from './PsPurchaseorderline.js'
export type { PsPurchaseorderreceipt, PsPurchaseorderreceiptCreate, PsPurchaseorderreceiptUpdate, PsPurchaseorderreceiptSelect, PsPurchaseorderreceiptExpand, PsPurchaseorderreceiptEntitySet } from './PsPurchaseorderreceipt.js'
export type { PsPurchaseorderreceiptline, PsPurchaseorderreceiptlineCreate, PsPurchaseorderreceiptlineUpdate, PsPurchaseorderreceiptlineSelect, PsPurchaseorderreceiptlineExpand, PsPurchaseorderreceiptlineEntitySet } from './PsPurchaseorderreceiptline.js'
export type { PsPurchaseorderreportgenerationrequest, PsPurchaseorderreportgenerationrequestCreate, PsPurchaseorderreportgenerationrequestUpdate, PsPurchaseorderreportgenerationrequestSelect, PsPurchaseorderreportgenerationrequestExpand, PsPurchaseorderreportgenerationrequestEntitySet } from './PsPurchaseorderreportgenerationrequest.js'

export { psdeliveryroutesEntitySet } from './PsDeliveryroutes.js'
export { psdeliveryscheduleEntitySet } from './PsDeliveryschedule.js'
export { psjobassetattachmentEntitySet } from './PsJobassetattachment.js'
export { salesorderEntitySet } from './Salesorder.js'
export { salesorderdetailEntitySet } from './Salesorderdetail.js'
export { pspostalareaboundaryEntitySet } from './PsPostalareaboundary.js'
export { psrelatedassetEntitySet } from './PsRelatedasset.js'
export { pssettingEntitySet } from './PsSetting.js'
export { psterritorygroupEntitySet } from './PsTerritorygroup.js'
export { psvehicledatabaseEntitySet } from './PsVehicledatabase.js'
export { productEntitySet } from './Product.js'
export { accountEntitySet } from './Account.js'
export { psstaffEntitySet } from './PsStaff.js'
export { psappfeatureEntitySet } from './PsAppfeature.js'
export { psjoblistEntitySet } from './PsJoblist.js'
export { aaduserEntitySet } from './Aaduser.js'
export { psporeportgenerationrequestEntitySet } from './PsPoreportgenerationrequest.js'
export { psproductsuppliermappingEntitySet } from './PsProductsuppliermapping.js'
export { pspurchaseorderEntitySet } from './PsPurchaseorder.js'
export { pspurchaseorderlineEntitySet } from './PsPurchaseorderline.js'
export { pspurchaseorderreceiptEntitySet } from './PsPurchaseorderreceipt.js'
export { pspurchaseorderreceiptlineEntitySet } from './PsPurchaseorderreceiptline.js'
export { pspurchaseorderreportgenerationrequestEntitySet } from './PsPurchaseorderreportgenerationrequest.js'

export const EntitySets = {
  psdeliveryroutes: 'ps_deliveryrouteses' as const,
  psdeliveryschedule: 'ps_deliveryschedules' as const,
  psjobassetattachment: 'ps_jobassetattachments' as const,
  salesorder: 'salesorders' as const,
  salesorderdetail: 'salesorderdetails' as const,
  pspostalareaboundary: 'ps_postalareaboundaries' as const,
  psrelatedasset: 'ps_relatedassets' as const,
  pssetting: 'ps_settings' as const,
  psterritorygroup: 'ps_territorygroups' as const,
  psvehicledatabase: 'ps_vehicledatabases' as const,
  product: 'products' as const,
  account: 'accounts' as const,
  psstaff: 'ps_staffs' as const,
  psappfeature: 'ps_appfeatures' as const,
  psjoblist: 'ps_joblists' as const,
  aaduser: 'aadusers' as const,
  psporeportgenerationrequest: 'ps_poreportgenerationrequests' as const,
  psproductsuppliermapping: 'ps_productsuppliermappings' as const,
  pspurchaseorder: 'ps_purchaseorders' as const,
  pspurchaseorderline: 'ps_purchaseorderlines' as const,
  pspurchaseorderreceipt: 'ps_purchaseorderreceipts' as const,
  pspurchaseorderreceiptline: 'ps_purchaseorderreceiptlines' as const,
  pspurchaseorderreportgenerationrequest: 'ps_purchaseorderreportgenerationrequests' as const,
} as const


export type DataverseEntity =
  | import('./PsDeliveryroutes.js').PsDeliveryroutes
  | import('./PsDeliveryschedule.js').PsDeliveryschedule
  | import('./PsJobassetattachment.js').PsJobassetattachment
  | import('./Salesorder.js').Salesorder
  | import('./Salesorderdetail.js').Salesorderdetail
  | import('./PsPostalareaboundary.js').PsPostalareaboundary
  | import('./PsRelatedasset.js').PsRelatedasset
  | import('./PsSetting.js').PsSetting
  | import('./PsTerritorygroup.js').PsTerritorygroup
  | import('./PsVehicledatabase.js').PsVehicledatabase
  | import('./Product.js').Product
  | import('./Account.js').Account
  | import('./PsStaff.js').PsStaff
  | import('./PsAppfeature.js').PsAppfeature
  | import('./PsJoblist.js').PsJoblist
  | import('./Aaduser.js').Aaduser
  | import('./PsPoreportgenerationrequest.js').PsPoreportgenerationrequest
  | import('./PsProductsuppliermapping.js').PsProductsuppliermapping
  | import('./PsPurchaseorder.js').PsPurchaseorder
  | import('./PsPurchaseorderline.js').PsPurchaseorderline
  | import('./PsPurchaseorderreceipt.js').PsPurchaseorderreceipt
  | import('./PsPurchaseorderreceiptline.js').PsPurchaseorderreceiptline
  | import('./PsPurchaseorderreportgenerationrequest.js').PsPurchaseorderreportgenerationrequest
