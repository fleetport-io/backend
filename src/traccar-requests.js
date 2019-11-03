const fetch = require('node-fetch');
const base64 = require('base-64');
const { URLSearchParams } = require('url');
const { RateLimit } = require('async-sema');

// JSON SCHEMA VALIDATION
const ajv = require('ajv');
let ajvValidator = new ajv();

let tripSchema = require('./schema/trip.json');
let ajvTrip = ajvValidator.compile(tripSchema);

class traccarAPI {
	constructor(email, password, baseURL) {
		this.email = email;
		this.password = password;
		this.baseURL = baseURL;
	}


	async getAllTrips(deviceID) {
		let allTrips = [];
		let allMonths = [];

		// LOOP TROUGH ALL MONTHS FROM 2010 (traccar creation date) TO NOW
		for (let startDate = new Date('01 Jan 2018 00:00:00 GMT'); startDate.getUTCFullYear() < (new Date().getUTCFullYear()); ) {
			for (let month = 0; month < 12; month++) {
				allMonths.push(new Date(startDate));

				startDate.setMonth(startDate.getMonth() + 1);
			}
		}

		// LOOP TRHOUGH MONTHS OF THIS YEAR
		let thisYearStart = new Date('01 Jan 2010 00:00:00 GMT');
		thisYearStart.setUTCFullYear(new Date().getUTCFullYear());

		for ( ; thisYearStart.getMonth() <= (new Date().getMonth()); thisYearStart.setMonth(thisYearStart.getMonth() + 1)) {
			allMonths.push(new Date(thisYearStart));
		}

		// MANUALLY PUSH NEXT MONTH
		thisYearStart.setMonth(thisYearStart.getMonth() + 1);
		allMonths.push(new Date(thisYearStart));

		// LIMIT TO 2 REQUEST PER SECOND
		const lim = RateLimit(3);

		// SEND REQUESTS FOR EVERY MONTH
		for (let i = 0; i < allMonths.length - 1; i++) {
			await lim();

			console.log(`SENDING REQUEST FOR TRIPS FROM ${allMonths[i].toISOString()} to ${allMonths[i + 1].toISOString()}`);
			let thisMonthTrips = await this.getTrips(deviceID, allMonths[i].toISOString(), allMonths[i + 1].toISOString());
			
			for (let j = 0; j < thisMonthTrips.length; j++) {
				allTrips.push(thisMonthTrips[j]);
			}	
		}

		console.log("FINISHED ALL REQUESTS");
		return allTrips;
	}

	async getAllRoutes(deviceID) {
		let allRoutes = [];
		let allDays = [];


		// LOOP TROUGH ALL DAYS FROM 2010 (traccar creation date) TO NOW
		for (let startDate = new Date('01 Jan 2019 00:00:00 GMT'); startDate.getTime() <= (new Date().getTime()); startDate.setDate(startDate.getDate() + 1)) {
			allDays.push(new Date(startDate));
		}

		// LIMIT TO 2 REQUEST PER SECOND
		const lim = RateLimit(2);
		for (let i = 0; i < allDays.length - 1; i++) {
			await lim();

			console.log(`SENDING REQUEST FOR ROUTES FROM ${allDays[i].toISOString()} to ${allDays[i + 1].toISOString()}`);
			let thisDaysRoutes = await this.getRoutes(deviceID, allDays[i].toISOString(), allDays[i + 1].toISOString())

			for (var j = 0; j < thisDaysRoutes.length; j++) {
				allRoutes.push(thisDaysRoutes[j]);
			}
		}

		console.log("FINISHED ALL REQUESTS");
		return allRoutes;
	}


	// GET STOPS
	async getStops(deviceID, from, to) {
		try {
			let response = await fetch(`${this.baseURL}/api/reports/stops?deviceId=${deviceID}&from=${from}&to=${to}`, {
				method: 'GET',
				headers: {
					'Authorization': 'Basic ' + base64.encode(this.email + ":" + this.password)
				}
			});

			let data = await response.json();
			return data;
		} catch(error) {
			console.error(error);
		}
	}

	// GET ROUTES
	async getRoutes(deviceID, from, to) {
		try {
			let response = await fetch(`${this.baseURL}/api/reports/route?deviceId=${deviceID}&from=${from}&to=${to}`, {
				method: 'GET',
				headers: {
					'Authorization': 'Basic ' + base64.encode(this.email + ":" + this.password)
				}
			});

			let data = await response.json();
			return data;
		} catch(error) {
			console.error(error);
		}
	}

	// GET EVENTS
	async getEvents(deviceID, eventType, from, to) {
		try {
			let response = await fetch(`${this.baseURL}/api/reports/trips?deviceId=${deviceID}&type=${eventType}&from=${from}&to=${to}`, {
				method: 'GET',
				headers: {
					'Authorization': 'Basic ' + base64.encode(this.email + ":" + this.password)
				}
			});

			let data = await response.json();
			return data;
		} catch(error) {
			console.error(error);
		}
	}

	// GET TRIPS
	async getTrips(deviceID, from, to) {
		try {
			let response = await fetch(`${this.baseURL}/api/reports/trips?deviceId=${deviceID}&from=${from}&to=${to}`, {
				method: 'GET',
				headers: {
					'Authorization': 'Basic ' + base64.encode(this.email + ":" + this.password)
				}
			});

			let data = await response.json();

			let validSchema = ajvTrip(data);
			if (validSchema !== true) {
				console.log("TRIP SCHEMA DOES NOT MATCH", ajvTrip.errors);
				return [];
			}

			return data;
		} catch(error) {
			console.error(error);
		}
	}

	// GET DEVICE LIST
	async getDevices() {
		try {
			let response = await fetch(this.baseURL + '/api/devices', {
				method: 'GET',
				headers: {
					'Authorization': 'Basic ' + base64.encode(this.email + ":" + this.password)
				}
			});

			console.log(response);

			let data = await response.json();
			return data;
		} catch(error) {
			console.error(error);
		}
	}

	// GET SERVER STATS
	async getStatistics(from, to) {
		try {
			let response = await fetch(`${this.baseURL}/api/statistics?from=${from}&to=${to}`, {
				method: 'GET',
				headers: {
					'Authorization': 'Basic ' + base64.encode(this.email + ":" + this.password)
				}
			});

			let data = await response.json();
			return data;
		} catch(error) {
			console.error(error);
		}
	}



	// GET USER TOKEN
	async getToken() {
		try {
			const params = new URLSearchParams();
			params.append('email', email);
			params.append('password', password);

			let response = await fetch(this.baseURL + '/api/session', {
				method: 'POST',
				body: params
			});

			let cookie = await response.headers.raw()['set-cookie'];
			let data = await response.json();

			return data.token;
		} catch(error) {
			console.error(error);
		}
	}
}

module.exports = traccarAPI;