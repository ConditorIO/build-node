const firebase = require('firebase');
const request = require('request');
const tar = require('tar');
const urlParse = require('url-parse');

const site_id = process.argv[2];
const build_id = process.argv[3];

firebase.initializeApp({
	serviceAccount: JSON.parse(process.env.GCLOUD_SERVICE_ACCOUNT),
	databaseURL: process.env.FIREBASE_DATABASE_URL,
	databaseAuthVariableOverride: {
		uid: "build-worker"
	}
});

Promise.all([
	firebase.database().ref('sites').child(site_id).once("value"),
	firebase.database().ref('builds').child(site_id).child(build_id).once("value")
]).then(results => {
	var [site, build] = results.map(i => i.val());
	if(!site || !build) return Promise.reject("Site or build not found.");

	var repoPath = urlParse(site.repo.url).pathname;

	request('https://api.github.com/repos/' + repoPath + '/tarball/' + build.commit_id, {
		headers: {
			'Authorization: token ' + site.repo.read_token
		}
	}).pipe(tar.Extract({
		path: 'build',
		strip: 1
	}))
});
