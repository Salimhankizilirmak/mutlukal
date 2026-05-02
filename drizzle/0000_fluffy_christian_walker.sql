CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`workOrderNo` text NOT NULL,
	`deviceId` text NOT NULL,
	`org_id` text NOT NULL,
	`fileUrl` text NOT NULL,
	`reportUrl` text,
	`status` text DEFAULT 'pending',
	`createdAt` integer
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`lineId` text NOT NULL,
	`name` text NOT NULL,
	`deviceSecret` text NOT NULL,
	`pinCode` text NOT NULL,
	`org_id` text NOT NULL,
	FOREIGN KEY (`lineId`) REFERENCES `productionLines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `importBatches` (
	`id` text PRIMARY KEY NOT NULL,
	`deviceId` text NOT NULL,
	`workOrderNo` text NOT NULL,
	`fileUrl` text NOT NULL,
	`reportUrl` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`fileSize` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer,
	FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `productionLines` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`org_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `productionReports` (
	`id` text PRIMARY KEY NOT NULL,
	`batchId` text NOT NULL,
	`fileName` text NOT NULL,
	`fileUrl` text NOT NULL,
	`createdAt` integer,
	FOREIGN KEY (`batchId`) REFERENCES `importBatches`(`id`) ON UPDATE no action ON DELETE no action
);
