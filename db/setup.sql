/* ============================================================
 * ZiboSmartTraffic - Database bootstrap (run in SSMS, Windows auth)
 *
 * HOW TO RUN:
 *   1. Open SQL Server Management Studio -> connect to:  localhost  (Windows Authentication)
 *   2. File -> Open -> this file (setup.sql)
 *   3. Execute (F5)
 *
 * What it does (idempotent, safe to run multiple times):
 *   - Creates database  ZiboSmartTraffic
 *   - Creates SQL login zibo_app / password Zibo2026@Traffic  (app server uses this)
 *   - Creates application user + db_owner
 *   - Creates 10 business tables used by the map app
 *
 * NOTE: all identifiers are pure ASCII to avoid codepage issues;
 *       Chinese data lives in NVARCHAR columns and is inserted via db/seed.sql.
 * ============================================================ */

/* ---- 1. database ---- */
IF DB_ID('ZiboSmartTraffic') IS NULL
  CREATE DATABASE ZiboSmartTraffic;
GO

/* ---- 2. app login + user ---- */
USE ZiboSmartTraffic;
GO

IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'zibo_app')
  DROP USER [zibo_app];
GO

IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'zibo_app')
  DROP LOGIN [zibo_app];
GO

CREATE LOGIN [zibo_app]
  WITH PASSWORD = N'Zibo2026@Traffic',
       CHECK_POLICY = OFF,
       DEFAULT_DATABASE = [ZiboSmartTraffic];
GO

CREATE USER [zibo_app] FOR LOGIN [zibo_app];
ALTER ROLE [db_owner] ADD MEMBER [zibo_app];
GO

/* ---- 3. tables (all re-creatable: drop first) ---- */

IF OBJECT_ID('dbo.districts', 'U') IS NOT NULL DROP TABLE dbo.districts;
CREATE TABLE dbo.districts (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(50)  NOT NULL,
  lng        FLOAT         NOT NULL,
  lat        FLOAT         NOT NULL,
  population FLOAT         NOT NULL
);

IF OBJECT_ID('dbo.cameras', 'U') IS NOT NULL DROP TABLE dbo.cameras;
CREATE TABLE dbo.cameras (
  id     INT IDENTITY(1,1) PRIMARY KEY,
  cam_id NVARCHAR(20)  NOT NULL,
  name   NVARCHAR(100) NOT NULL,
  road   NVARCHAR(100) NOT NULL,
  status NVARCHAR(10)  NOT NULL DEFAULT N'normal',   -- normal / fault
  area   NVARCHAR(20)  NOT NULL,
  lng    FLOAT         NOT NULL,
  lat    FLOAT         NOT NULL
);
CREATE INDEX ix_cameras_status ON dbo.cameras(status);
CREATE INDEX ix_cameras_area   ON dbo.cameras(area);

IF OBJECT_ID('dbo.traffic_lights', 'U') IS NOT NULL DROP TABLE dbo.traffic_lights;
CREATE TABLE dbo.traffic_lights (
  id    INT IDENTITY(1,1) PRIMARY KEY,
  tl_id NVARCHAR(20)  NOT NULL,
  name  NVARCHAR(100) NOT NULL DEFAULT N'',
  state NVARCHAR(10)  NOT NULL,   -- green / red / yellow / fault
  area  NVARCHAR(20)  NOT NULL,
  lng   FLOAT         NOT NULL,
  lat   FLOAT         NOT NULL
);
CREATE INDEX ix_tl_state ON dbo.traffic_lights(state);

IF OBJECT_ID('dbo.police', 'U') IS NOT NULL DROP TABLE dbo.police;
CREATE TABLE dbo.police (
  id       INT IDENTITY(1,1) PRIMARY KEY,
  pol_id   NVARCHAR(20)  NOT NULL,
  name     NVARCHAR(50)  NOT NULL,
  badge    NVARCHAR(20)  NOT NULL,
  district NVARCHAR(20)  NOT NULL,
  on_duty  BIT           NOT NULL DEFAULT 1,   -- 1 = on duty
  location NVARCHAR(150) NOT NULL DEFAULT N'',
  lng      FLOAT         NOT NULL,
  lat      FLOAT         NOT NULL
);

IF OBJECT_ID('dbo.alerts', 'U') IS NOT NULL DROP TABLE dbo.alerts;
CREATE TABLE dbo.alerts (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  alert_id    NVARCHAR(20)  NOT NULL,
  type        NVARCHAR(20)  NOT NULL,   -- 交通事故 / 交通管制 / 设备故障 / 道路施工 / 天气影响
  level       INT           NOT NULL,   -- 1..4 severity
  area        NVARCHAR(20)  NOT NULL,
  road        NVARCHAR(100) NOT NULL DEFAULT N'',
  lng         FLOAT         NOT NULL,
  lat         FLOAT         NOT NULL,
  minutes_ago INT           NOT NULL DEFAULT 0,
  status      NVARCHAR(10)  NOT NULL,   -- handling / pending
  car_num     NVARCHAR(20)  NOT NULL DEFAULT N''
);
CREATE INDEX ix_alerts_status ON dbo.alerts(status);

IF OBJECT_ID('dbo.events', 'U') IS NOT NULL DROP TABLE dbo.events;
CREATE TABLE dbo.events (
  id        INT IDENTITY(1,1) PRIMARY KEY,
  event_num NVARCHAR(20)  NOT NULL,
  name      NVARCHAR(50)  NOT NULL,
  area      NVARCHAR(20)  NOT NULL,
  car_num   NVARCHAR(20)  NOT NULL DEFAULT N'',
  phone     NVARCHAR(20)  NOT NULL DEFAULT N'',
  level     INT           NOT NULL DEFAULT 2,
  lng       FLOAT         NOT NULL,
  lat       FLOAT         NOT NULL
);

IF OBJECT_ID('dbo.congestion', 'U') IS NOT NULL DROP TABLE dbo.congestion;
CREATE TABLE dbo.congestion (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  name       NVARCHAR(100) NOT NULL,
  level      INT           NOT NULL,   -- 0 severe / 1 medium / 2 light
  level_name NVARCHAR(20)  NOT NULL,
  avg_speed  INT           NOT NULL,
  flow       INT           NOT NULL,
  area       NVARCHAR(20)  NOT NULL,
  lng        FLOAT         NOT NULL,
  lat        FLOAT         NOT NULL
);
CREATE INDEX ix_congestion_level ON dbo.congestion(level);

IF OBJECT_ID('dbo.heat_points', 'U') IS NOT NULL DROP TABLE dbo.heat_points;
CREATE TABLE dbo.heat_points (
  id    INT IDENTITY(1,1) PRIMARY KEY,
  lng   FLOAT NOT NULL,
  lat   FLOAT NOT NULL,
  value INT   NOT NULL
);

IF OBJECT_ID('dbo.bus_routes', 'U') IS NOT NULL DROP TABLE dbo.bus_routes;
CREATE TABLE dbo.bus_routes (
  id      INT IDENTITY(1,1) PRIMARY KEY,
  ref     NVARCHAR(20)  NOT NULL,
  name    NVARCHAR(150) NOT NULL,
  dep_stop NVARCHAR(100) NOT NULL,
  arr_stop NVARCHAR(100) NOT NULL,
  via     INT           NOT NULL DEFAULT 0,
  color   NVARCHAR(20)  NOT NULL DEFAULT N'#2b8cff',
  geometry NVARCHAR(MAX) NOT NULL    -- GeoJSON LineString string
);

IF OBJECT_ID('dbo.bus_stops', 'U') IS NOT NULL DROP TABLE dbo.bus_stops;
CREATE TABLE dbo.bus_stops (
  id      INT IDENTITY(1,1) PRIMARY KEY,
  stop_id NVARCHAR(20)  NOT NULL,
  name    NVARCHAR(100) NOT NULL,
  lng     FLOAT         NOT NULL,
  lat     FLOAT         NOT NULL
);

/* ---- 11. system users (login accounts; password is scrypt hash, never plaintext) ----
 * NOTE: this table is NOT registered in the server's TABLES whitelist on purpose:
 * the generic CRUD would expose password_hash/salt. Login only via /api/auth/login.
 * The default admin account is auto-created by the server on first boot
 * (username/password from server/.env ADMIN_USERNAME / ADMIN_PASSWORD, default admin/123456). */
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;
CREATE TABLE dbo.users (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  username      NVARCHAR(50)  NOT NULL,
  password_hash NVARCHAR(200) NOT NULL,   -- scrypt 64B -> 128 hex chars
  salt          NVARCHAR(64)  NOT NULL,   -- 16B -> 32 hex chars
  display_name  NVARCHAR(50)  NOT NULL DEFAULT N'',
  created_at    DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);
CREATE UNIQUE INDEX ux_users_username ON dbo.users(username);

PRINT 'setup.sql done: database ZiboSmartTraffic ready (10 business tables + users login table). Next: run db/seed.sql';
GO
