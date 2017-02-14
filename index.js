const firebase = require('firebase-admin');
const Promise = require('promise');
const request = require('request');
const tar = require('tar');
const gunzip = require('gunzip-maybe');
const urlParse = require('url-parse');
const fs = require('fs');
const colors = require('colors');

console.log(`
   ######   #######  ##    ## ########  #### ########  #######  ########
  ##    ## ##     ## ###   ## ##     ##  ##     ##    ##     ## ##     ##
  ##       ##     ## ####  ## ##     ##  ##     ##    ##     ## ##     ##
  ##       ##     ## ## ## ## ##     ##  ##     ##    ##     ## ########
  ##       ##     ## ##  #### ##     ##  ##     ##    ##     ## ##   ##
  ##    ## ##     ## ##   ### ##     ##  ##     ##    ##     ## ##    ##
   ######   #######  ##    ## ########  ####    ##     #######  ##     ##
`.red);

const site_id = process.argv[2];
const build_id = process.argv[3];

const serviceAccount = JSON.parse(process.env.GCLOUD_SERVICE_ACCOUNT);

firebase.initializeApp({
	credential: firebase.credential.cert(serviceAccount),
	databaseURL: process.env.FIREBASE_DATABASE_URL,
	databaseAuthVariableOverride: {
		uid: "build-worker"
	}
});

var build = firebase.database().ref().child("builds").child(site_id).child(build_id);

Promise.all([
	firebase.database().ref().child("sites").child(site_id).once("value"),
	build.once("value")
])
.then(results => {
	var [site, build] = results.map(i => i.val());
	if(!site || !build) return Promise.reject("Site or build not found.");

	console.log("Fetched Metadata".green);

	build.child("status").set("status", "running");
	build.child("started_at").set(firebase.database.ServerValue.TIMESTAMP);

	const repoPath = urlParse(site.repo.url).pathname;
	const url = 'https://api.github.com/repos' + repoPath + '/tarball/' + build.commit_id + "?access_token=" + site.repo.read_token;

	var chunk = 0;

	return new Promise((resolve, reject) => {
		console.log("Downloading and extracting from GitHub");

		request(url, {
	    	headers: {'User-Agent': 'Conditor'}
		})
		.on("response", (r) => {res = r})
		.pipe(gunzip())
		.pipe(tar.Extract({
			path: './build',
			strip: 1
		}))
		.on("data", () => {if(chunk++ % 1024 == 0) process.stdout.write(".")})
		.on("end", resolve)
		.on("error", reject);
	});
})
.then(() => console.log("\nFinished download!".green))
.then(() => {

})
.catch((e) => {
	build.child("status").set("failed");
	build.child("finished_at").set(firebase.database.ServerValue.TIMESTAMP);
	console.error(e);
	process.exit(1);
})
.then(() => process.exit());
