// IMPORTS
var fetch = require('node-fetch');
const cron = require('node-cron');
const config = require('config');
let cfg = config.get('fleetport');

const Database = require('better-sqlite3');
const db = new Database('fleetport.db', { verbose: console.log });
const setupDatabase = require('./database-setup.js');
const persistenceLayer = require('./persistence.js');
const expressServer = require('./express-server.js');

// GLOBALS
let baseURL = `${cfg.host}:${cfg.port}`;

const traccarAPI = require('./traccar-requests');

//RUN MAIN
main();

async function main() { 
	let traccar = new traccarAPI(cfg.username, cfg.password, baseURL);

	// START UP DB & PULL NEW TRIPS & ROUTES FROM TRACCAR
	let persistence = new persistenceLayer(db, cfg.deviceID, cfg.login);
	setupDatabase(db);
	let fleetportMeta = await persistence.getMetaData();
	if (fleetportMeta.lastUpdated === 0) {
		// CLEAR DATABASE
		await persistence.clearTrips();
		await persistence.clearRoutes();

		// TRIPS
		let allTrips = await traccar.getAllTrips(cfg.deviceID);
		await persistence.saveTripsArray(allTrips);

		// ROUTES
		let allRoutes = await traccar.getAllRoutes(cfg.deviceID);
		await persistence.saveRoutesArray(allRoutes);
	} else {
		// TRIPS
		let startDate = new Date(fleetportMeta.lastUpdated);
		let newTrips = await traccar.getTrips(cfg.deviceID, startDate.toISOString(), new Date().toISOString());
		await persistence.saveTripsArray(newTrips);

		// ROUTES
		let newRoutes = await traccar.getRoutes(cfg.deviceID, startDate.toISOString(), new Date().toISOString());
		await persistence.saveRoutesArray(newRoutes);
	}

	await persistence.updateMeta();

	// SET UP TRIPS & ROUTES POLLING
	cron.schedule('*/10 * * * *', async () => {
		console.log("POLLING NEW TRIPS & ROUTES FROM SERVER");
		// GET START DATE
		let fleetportMeta = await persistence.getMetaData();

		// TRIPS
		let startDate = new Date(fleetportMeta.lastUpdated);
		let newTrips = await traccar.getTrips(cfg.deviceID, startDate.toISOString(), new Date().toISOString());
		await persistence.saveTripsArray(newTrips);

		// ROUTES
		let newRoutes = await traccar.getRoutes(cfg.deviceID, startDate.toISOString(), new Date().toISOString());
		await persistence.saveRoutesArray(newRoutes);

		await persistence.updateMeta();
	});


	// START UP EXPRESS SERVER
	persistence.setupRoutes();
	let server = new expressServer(persistence.getRouter(), cfg.SSL, cfg.login);

	server.app.get('/', async (req, res) => {
		let temp = await traccar.getRoutes(1, "2019-10-28T18:58:22.018Z", "2019-10-29T18:58:22.018Z");
		res.send(temp);
	});
}


// GRACEFUL SHUTDOWN
process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));