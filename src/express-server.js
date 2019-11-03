const path = require('path');
const fs = require('fs');

const http = require('http');
const https = require('https');
const express = require('express');

const helmet = require('helmet');
const basicAuth = require('express-basic-auth');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');

class expressServer {
	constructor(routes, ssl, login) {
		this.app = express();
		this.setup(routes, ssl, login);
	};

	// PASS AN EXPRESSJS ROUTES OBJECT TO THIS FUNCTION
	async setup(routes, ssl, login) {
		// SET UP MIDDLEWARE
		this.app.use(helmet());
		this.app.use(express.json());
		this.app.use("/api", routes);

		// SET UP LOGGING
		var accessLogStream = rfs('access.log', {
			interval: '1d', // rotate daily
			path: path.join(__dirname, '../log/frontend-server')
		});

		this.app.use(morgan('combined', { stream: accessLogStream }))

		// SET UP LOGIN
		this.app.use(basicAuth({
		    users: { [login.username]: login.password },
		    challenge: true
		}));

		if (ssl === true) {
				// SET UP SSL AND HTTPS REDIRECT
				// LOCAL HTTPS: https://www.freecodecamp.org/news/how-to-get-https-working-on-your-local-development-environment-in-5-minutes-7af615770eec/
				let sslOptions = {
					key: fs.readFileSync('certs/server.key'),
					cert: fs.readFileSync('certs/server.crt')
				};
		
				let server = https.createServer(sslOptions, this.app);
				server.listen(443, function() {
					console.log("Express server listening on port 443!");
				});
		
				http.createServer(function (req, res) {
					res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
					res.end();
				}).listen(80);
			} else {
				this.app.listen(80, function() {
					console.log("Express server listening on port 80!");
				});	
			}
	}
}

module.exports = expressServer;