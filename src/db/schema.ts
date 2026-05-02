import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: text('owner_id').notNull().unique(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
});

export const productionLines = sqliteTable('productionLines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  factoryOwnerId: text('factory_owner_id').notNull(),
});

export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  lineId: text('lineId').notNull().references(() => productionLines.id),
  name: text('name').notNull(),
  deviceSecret: text('deviceSecret').notNull(),
  pinCode: text('pinCode').notNull(),
  factoryOwnerId: text('factory_owner_id').notNull(),
});

export const importBatches = sqliteTable('importBatches', {
  id: text('id').primaryKey(),
  deviceId: text('deviceId').notNull().references(() => devices.id),
  workOrderNo: text('workOrderNo').notNull(),
  fileUrl: text('fileUrl').notNull(),
  status: text('status').notNull().default('pending'),
  fileSize: integer('fileSize').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const batches = sqliteTable('batches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workOrderNo: text('workOrderNo').notNull(),
  deviceId: text('deviceId').notNull(),
  factoryOwnerId: text('factory_owner_id').notNull(),
  fileUrl: text('fileUrl').notNull(),
  reportUrl: text('reportUrl'),
  status: text('status').default('pending'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
