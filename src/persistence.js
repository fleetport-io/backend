const path = require('path');
const fs = require('fs');

const uuid = require('uuid').v4;
const express = require("express");
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const helmet = require('helmet');
const basicAuth = require('express-basic-auth');

// JSON SCHEMA VALIDATION
const ajv = require('ajv');
let ajvValidator = new ajv();
let genericRequestSchema = require('./schema/genericRequest.json');
let ajvGeneric = ajvValidator.compile(genericRequestSchema);

let badRequestDefault = {
	"type": "info",
	"text": "invalid input arguments"
};

class persistenceLayer {
	constructor(db, deviceID, login) {
		this.db = db;
		this.deviceID = deviceID;
		this.router = express.Router();

		this.router.use(helmet());
		this.router.use(express.json());

		let accessLogStream = rfs('access.log', {
			interval: '1d', // rotate daily
			path: path.join(__dirname, '../log/api')
		});
		this.router.use(morgan('combined', { stream: accessLogStream }))

		// SET UP LOGIN
		this.router.use(basicAuth({
		    users: { [login.username]: login.password },
		    challenge: true
		}));
	}

	async getMetaData() {
		let stmt = this.db.prepare('SELECT * FROM \`fleetport-meta\`');
		let info = stmt.all();

		return info[0];
	}

	// CLEAR TABLES
	async clearTrips() {
		let stmt = await this.db.prepare('DELETE FROM "trips"');
		let info = stmt.run();
		console.log(info);
	}

	async clearRoutes() {
		let stmt = await this.db.prepare('DELETE FROM "routes"');
		let info = stmt.run();
		console.log(info);
	}

	// SAVE TO DB
	async saveTripsArray(newTrips) {
		let stmt = this.db.prepare(`INSERT INTO "main"."trips" ("uuid", "deviceId", "deviceName", "averageSpeed", "maxSpeed", "spentFuel", "startOdometer", "endOdometer", "startPositionId", "endPositionId", "startLat", "startLon", "endLat", "endLon", "startTime", "startAddress", "endTime", "endAddress", "duration", "driverUniqueId", "driverName", "distance")
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`);

		for (var i = 0; i < newTrips.length; i++) {
			// CONVERT ISO8601 TO TIMESTAMPS
			newTrips[i].startTime = new Date(newTrips[i].startTime).getTime();
			newTrips[i].endTime = new Date(newTrips[i].endTime).getTime();

			let info = stmt.run(uuid(), newTrips[i].deviceId, newTrips[i].deviceName, newTrips[i].averageSpeed, newTrips[i].maxSpeed, newTrips[i].spentFuel, newTrips[i].startOdometer, newTrips[i].endOdometer, newTrips[i].startPositionId, newTrips[i].endPositionId, newTrips[i].startLat, newTrips[i].startLon, newTrips[i].endLat, newTrips[i].endLon, newTrips[i].startTime, newTrips[i].startAddress, newTrips[i].endTime, newTrips[i].endAddress, newTrips[i].duration, newTrips[i].driverUniqueId, newTrips[i].driverName, newTrips[i].distance);
			console.log(info);
		}
	}

	async saveRoutesArray(newRoutes) {
		// MAP ROUTES TO TRIPS
		let stmt = this.db.prepare('SELECT * FROM "trips"');
		let allTrips = stmt.all();

		allTrips.sort((a, b) => {
			if (a.startTime < b.startTime)
				return -1;
			if (a.startTime < b.startTime)
				return 1;

			return 0;
		});

		for (var i = 0; i < newRoutes.length; i++) {
			newRoutes[i].fixTime = new Date(newRoutes[i].fixTime).getTime();
		}

		newRoutes.sort((a, b) => {
			if (a.fixTime < b.fixTime)
				return -1;
			if (a.fixTime < b.fixTime)
				return 1;

			return 0;
		});

		// ASSIGN TRIP ID TO ROUTE
		for (var i = 0; i < newRoutes.length; i++) {
			let minimumDateIndex = 0;
			newRoutes[i].tripID = null;

			for (var j = minimumDateIndex; j < allTrips.length; j++) {

				// IF ROUTE TIME IS BETWEEN TRIP START AND END TIME ADD TO LIST
				if (newRoutes[i].fixTime > allTrips[j].startTime &&
					newRoutes[i].fixTime < allTrips[j].endTime) {
					// ADD TRIP ID TO ROUTE
					newRoutes[i].tripID = allTrips[j].uuid;

					// FOUND THE RIGHT TRIP - NEXT ROUTE
					continue;

				} else if (allTrips[j].endTime < newRoutes[i].fixTime) {
					// IF ROUTE TIME IS BIGGER THAN TRIP END TIME CUT NEXT LOOP THROUGH LIST
					minimumDateIndex = j - 1;
				}
			}
		}

		// SAVE ROUTES IN DB
		for (var i = 0; i < newRoutes.length; i++) {
			let stmt = this.db.prepare(`INSERT INTO "main"."routes" ("id", "tripID", "deviceId", "protocol", "fixTime", "latitude", "longitude", "altitude", "speed", "course", "attributes")
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`);

			let newRoutesInfo = stmt.run(newRoutes[i].id, newRoutes[i].tripID, newRoutes[i].deviceId, newRoutes[i].protocol, newRoutes[i].fixTime, newRoutes[i].latitude, newRoutes[i].longitude, newRoutes[i].altitude, newRoutes[i].speed, newRoutes[i].course, JSON.stringify(newRoutes[i].attributes));
			console.log(newRoutesInfo);
		}
	}

	// GET DATA FROM DB
	async getAbsoluteConsumption(from, to) {
		let stmt = this.db.prepare('SELECT * FROM "trips" WHERE startTime > ? AND endTime < ? AND deviceId=?');
		let info = stmt.all(from, to, this.deviceID);

		if (info.length === 0) {
			return {
				"totalFuelSpent": 0
			};
		}

		let totalFuelSpent = 0;
		for (var i = 0; i < info.length; i++) {
			totalFuelSpent += info[i].spentFuel;
		}

		return {
			"totalFuelSpent": totalFuelSpent
		};
	}

	async getAverageConsumption(from, to) {
		let stmt = this.db.prepare('SELECT * FROM "trips" WHERE startTime > ? AND endTime < ? AND deviceId=?');
		let info = stmt.all(from, to, this.deviceID);

		let totalFuelSpent = 0;
		let totalMileage = 0;

		if (info.length === 0) {
			return {
				"averageConsumption": 0
			};
		}

		for (var i = 0; i < info.length; i++) {
			totalFuelSpent += info[i].spentFuel;
			totalMileage += info[i].distance;
		}

		// CONVERT TO KM
		totalMileage /= 1000;

		let averageConsumption = 100 / (totalMileage / totalFuelSpent);
		return {
			"averageConsumption": averageConsumption
		};
	}

	async getMileage(from, to) {
		let stmt = this.db.prepare('SELECT * FROM "trips" WHERE startTime > ? AND endTime < ? AND deviceId=?');
		let info = stmt.all(from, to, this.deviceID);

		if (info.length === 0) {
			return {
				"totalMileage": 0
			};
		}

		let totalMileage = 0;
		for (var i = 0; i < info.length; i++) {
			totalMileage += info[i].distance;
		}

		return {
			"totalMileage": totalMileage
		};
	}

	async getAllTrips(from, to) {
		let stmt = this.db.prepare('SELECT * FROM "trips" WHERE startTime > ? AND endTime < ? AND deviceId=?');
		let info = stmt.all(from, to, this.deviceID);

		if (info.length === 0) {
			return {
				"trips": null
			};
		}

		return {
			"allTrips": info
		};
	}

	async getTrip(id) {
		let stmt = this.db.prepare('SELECT * FROM "trips" WHERE uuid=?');
		let info = stmt.all(id);

		if (info.length === 0) {
			return {
				"trip": null
			};
		}

		return {
			"trip": info
		};
	}



	// SET LAST UPDATED IN META!
	async updateMeta() {
		let stmtMeta = this.db.prepare(`UPDATE "fleetport-meta" SET "lastUpdated" = ?, "firstRun" = ?`);
		let infoMeta = stmtMeta.run((+ Date.now()), 0);
		console.log(infoMeta);
	}

	// CHECK QUERY PARAMS FROM & TO
	async checkGenericQueryParams(req) {
		console.log(req.query);
		if (ajvGeneric(req.query) !== true) {
			console.log("GENERIC SCHEMA DOES NOT MATCH - ", ajvGeneric.errors);
			return false;
		}

		if (Number.isNaN(parseInt(req.query.from)) || Number.isNaN(parseInt(req.query.to))) {
			console.log("COULD NOT CONVERT STRING TO INT", req.query);
			return false;
		}

		return true;
	}


	// WE NEED TO HAVE THE ROUTES IN HERE TO LET THEM ACCESS OUR PERSISTENCE LAYER
	setupRoutes() {
		// PARAMS: START, END
		/*this.router.get("/report", async (req, res) => {			
			if (await this.checkGenericQueryParams(req) === false)
				res.send(badRequestDefault);

			let from = parseInt(req.query.from);
			let to = parseInt(req.query.to);

			console.log(new Date(from), new Date(to));

			res.send("TEST");
		});*/

		// PARAMS: START, END
		this.router.get("/absoluteConsumption", async (req, res) => {
			if (await this.checkGenericQueryParams(req) === false)
				res.send(badRequestDefault);

			let result = await this.getAbsoluteConsumption(parseInt(req.query.from), parseInt(req.query.to));
			res.send(result);
		});

		// PARAMS: START, END
		this.router.get("/averageConsumption", async (req, res) => {
			if (await this.checkGenericQueryParams(req) === false)
				res.send(badRequestDefault);

			let result = await this.getAverageConsumption(parseInt(req.query.from), parseInt(req.query.to));
			res.send(result);
		});

		// PARAMS: START, END
		this.router.get("/mileage", async (req, res) => {
			if (await this.checkGenericQueryParams(req) === false)
				res.send(badRequestDefault);

			let result = await this.getMileage(parseInt(req.query.from), parseInt(req.query.to));
			res.send(result);
		});

		// PARAMS: START, END
		this.router.get("/allTrips", async (req, res) => {
			if (await this.checkGenericQueryParams(req) === false)
				res.send(badRequestDefault);

			let result = await this.getAllTrips(parseInt(req.query.from), parseInt(req.query.to));
			res.send(result);
		});

		// PARAMS: ID
		this.router.get("/singleTrip", async (req, res) => {
			if (req.query.id === undefined || req.query.id === '')
				res.send(badRequestDefault);

			let result = await this.getTrip(req.query.id);
			res.send(result);
		});
	}

	getRouter() {
		return this.router;
	}
}

module.exports = persistenceLayer;