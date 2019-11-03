function setupDatabase(db) {
	db.pragma('journal_mode = WAL');

	// SETUP TRIPS TABLE
	db.exec(`
		CREATE TABLE IF NOT exists \`trips\` ( \`uuid\` TEXT NOT NULL, \`deviceId\` INT NOT NULL , \`deviceName\` TEXT NOT NULL , \`averageSpeed\` REAL NOT NULL , \`maxSpeed\` REAL NOT NULL , \`spentFuel\` REAL NOT NULL , \`startOdometer\` REAL NOT NULL , \`endOdometer\` REAL NOT NULL , \`startPositionId\` INT NOT NULL , \`endPositionId\` INT NOT NULL , \`startLat\` REAL NOT NULL , \`startLon\` REAL NOT NULL , \`endLat\` REAL NOT NULL , \`endLon\` REAL NOT NULL , \`startTime\` INT NOT NULL , \`startAddress\` TEXT , \`endTime\` INT NOT NULL , \`endAddress\` TEXT , \`duration\` INT NOT NULL , \`driverUniqueId\` INT , \`driverName\` TEXT , \`distance\` REAL NOT NULL, PRIMARY KEY("uuid") );
	`);

	// SETUP ROUTES TABLE
	db.exec(`CREATE TABLE IF NOT exists "routes" (
		"id"	INTEGER NOT NULL,
		"tripID"	TEXT,
		"deviceId"	INTEGER NOT NULL,
		"protocol"	TEXT NOT NULL,
		"fixTime"	INTEGER NOT NULL,
		"latitude"	REAL,
		"longitude"	REAL,
		"altitude"	REAL,
		"speed"	REAL,
		"course"	REAL,
		"attributes"	TEXT NOT NULL,
		PRIMARY KEY("id")
	);`);

	//SETUP META TABLE
	db.exec(`
		CREATE TABLE IF NOT EXISTS \`fleetport-meta\` (
			"lastUpdated"	INTEGER NOT NULL,
			"firstRun"		INTEGER NOT NULL
		);
	`);

	let stmt = db.prepare('SELECT * FROM \`fleetport-meta\`');
	let info = stmt.all();

	// FIRST RUN
	if (info.length === 0) {
		// SET DEFAULTS
		let stmt = db.prepare(`INSERT INTO "fleetport-meta" ("lastUpdated", "firstRun") VALUES (?, ?)`);
		let info = stmt.run(0, 1);
	}
}

module.exports = setupDatabase;