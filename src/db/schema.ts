import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const productionLines = sqliteTable('productionLines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  orgId: text('org_id').notNull(),
});

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  lineId: text('lineId').notNull().references(() => productionLines.id),
  name: text('name').notNull(),
  deviceSecret: text('deviceSecret').notNull(),
  pinCode: text('pinCode').notNull(),
  orgId: text('org_id').notNull(),
});

export const importBatches = sqliteTable('importBatches', {
  id: text('id').primaryKey(),
  deviceId: text('deviceId').notNull().references(() => devices.id),
  workOrderNo: text('workOrderNo').notNull(),
  fileUrl: text('fileUrl').notNull(),
  reportUrl: text('reportUrl'),
  status: text('status').notNull().default('pending'),
  fileSize: integer('fileSize').notNull(),
  productionDate: text('productionDate'),
  expirationDate: text('expirationDate'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }),
});

export const productionReports = sqliteTable('productionReports', {
  id: text('id').primaryKey(),
  batchId: text('batchId').notNull().references(() => importBatches.id),
  fileName: text('fileName').notNull(),
  fileUrl: text('fileUrl').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const batches = sqliteTable('batches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workOrderNo: text('workOrderNo').notNull(),
  deviceId: text('deviceId').notNull(),
  orgId: text('org_id').notNull(),
  fileUrl: text('fileUrl').notNull(),
  reportUrl: text('reportUrl'),
  status: text('status').default('pending'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const b2bPartners = sqliteTable('b2b_partners', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(), // e.g., Triton, Germes, Samakat, TVK Import, Magnit
  orgId: text('org_id').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const b2bBrands = sqliteTable('b2b_brands', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text('partner_id').notNull().references(() => b2bPartners.id),
  name: text('name').notNull(), // e.g., Tortillas, Smart tortillas, Baskısız
  orgId: text('org_id').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const b2bOrders = sqliteTable('b2b_orders', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  partnerId: text('partner_id').notNull().references(() => b2bPartners.id),
  brandId: text('brand_id').references(() => b2bBrands.id),
  orderName: text('order_name').notNull(), // Custom manual name e.g., "Triton - Nisan", "ZPL-012080"
  orgId: text('org_id').notNull(),
  
  // Phase 1: Firmadan Gelen CSV
  phase1FileUrl: text('phase1_file_url'),
  phase1FileName: text('phase1_file_name'),
  phase1AllFiles: text('phase1_all_files'), // JSON array of all CSV filenames in group

  // Phase 2: Makineye Gönderilen Excel
  phase2FileUrl: text('phase2_file_url'),
  phase2FileName: text('phase2_file_name'),
  phase2AllFiles: text('phase2_all_files'), // JSON array: [{name, size, isPart}]

  // Phase 3: Cihazdan Alınan Excel
  phase3FileUrl: text('phase3_file_url'),
  phase3FileName: text('phase3_file_name'),
  phase3AllFiles: text('phase3_all_files'), // JSON array: [{name, size}]

  // Phase 4: Firmaya Gönderilen Rapor CSV (Reconciled SSCC)
  phase4FileUrl: text('phase4_file_url'),
  phase4FileName: text('phase4_file_name'),
  phase4AllFiles: text('phase4_all_files'), // JSON array: [{name, size}]

  // Notlar (her aşama için serbest metin notu)
  phase1Note: text('phase1_note'),
  phase2Note: text('phase2_note'),
  phase3Note: text('phase3_note'),
  phase4Note: text('phase4_note'),

  status: text('status').default('phase1_pending'), // tracks progress
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }),
});

export const b2bSettings = sqliteTable('b2b_settings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  orgId: text('org_id').notNull(),
  key: text('key').notNull(), // e.g., 'monthly_master_list'
  value: text('value'), // JSON string
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
