CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `odometer_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`vehicle_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`odometer` real NOT NULL,
	`source` text NOT NULL,
	`photo_path` text,
	`photo_local_uri` text
);
--> statement-breakpoint
CREATE INDEX `odo_vehicle_ts_idx` ON `odometer_readings` (`vehicle_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `photo_uploads` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`path_column` text NOT NULL,
	`local_uri` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `refuels` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`vehicle_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`odometer` real NOT NULL,
	`litres` real NOT NULL,
	`rate_per_litre` real NOT NULL,
	`total_cost` real NOT NULL,
	`station_name` text,
	`lat` real,
	`lng` real,
	`receipt_photo_path` text,
	`receipt_photo_local_uri` text,
	`anomaly_cause` text,
	`anomaly_note` text
);
--> statement-breakpoint
CREATE INDEX `refuels_vehicle_ts_idx` ON `refuels` (`vehicle_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `reminder_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`vehicle_id` text NOT NULL,
	`service_type` text NOT NULL,
	`interval_km` real,
	`interval_days` integer,
	`mode` text DEFAULT 'auto' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rules_vehicle_idx` ON `reminder_rules` (`vehicle_id`);--> statement-breakpoint
CREATE TABLE `service_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`vehicle_id` text NOT NULL,
	`type` text NOT NULL,
	`timestamp` integer NOT NULL,
	`odometer` real NOT NULL,
	`cost` real,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `service_vehicle_ts_idx` ON `service_events` (`vehicle_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`plate` text NOT NULL,
	`plate_normalized` text NOT NULL,
	`type` text NOT NULL,
	`make` text,
	`model` text,
	`odometer_start` real NOT NULL,
	`photo_path` text,
	`photo_local_uri` text,
	`reg_card_photo_path` text,
	`reg_card_photo_local_uri` text
);
--> statement-breakpoint
CREATE INDEX `vehicles_user_idx` ON `vehicles` (`user_id`);