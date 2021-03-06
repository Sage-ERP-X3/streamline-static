"use strict";
/*!
 * Ext JS Connect
 * Copyright(c) 2010 Sencha Inc.
 * MIT Licensed
 */
/**
 * Module dependencies.
 */
var fs = require('fs');
var Path = require('path');
var utils = require('./utils');
var Buffer = require('buffer').Buffer;
var parseUrl = require('url').parse;
var queryString = require('querystring');

/**
 * Default browser cache maxAge of one year.
 */
var MAX_AGE = 31557600000;

/**
 * File buffer cache.
 */
var _cache = {};

/**
 * Static file server.
 *
 * Options:
 *
 *   - `root`     Root path from which to serve static files.
 *   - `maxAge`   Browser cache maxAge in milliseconds
 *   - `cache`    When true cache files in memory indefinitely,
 *                until invalidated by a conditional GET request.
 *                When given, maxAge will be derived from this value.
 *
 * @param {Object} options
 * @return {Function}
 * @api public
 */
exports.staticProvider = function(options) {
	var cache, maxAge, roots;

	// Support options object and root string
	if (typeof options == 'string') {
		roots = [options];
		maxAge = MAX_AGE;
	} else {
		options = options || {};
		maxAge = options.maxAge;
		roots = options.roots || [(process.connectEnv && process.connectEnv.staticRoot) || options.root || process.cwd()];
		cache = options.cache;
		if (cache && !maxAge) maxAge = cache;
		maxAge = maxAge || MAX_AGE;
	}

	return function staticProvider(_, req, res, opts) {
		if (req.method != 'GET' && req.method != 'HEAD') return false;

		req.headers = req.headers || {};
		req.url = req.url.split('?')[0]; // drop query string
		var hit, head = req.method == 'HEAD',
			filename, url = parseUrl(req.url),
			cacheKey = opts ? opts.cachePrefix + req.url : req.url;

		// Potentially malicious path
		var pathname = queryString.unescape(url.pathname);
		if (~pathname.indexOf('..')) {
			forbidden(res);
			return true;
		}

		// Cache hit
		if (cache && !conditionalGET(req) && (hit = _cache[cacheKey])) {
			res.writeHead(200, hit.headers);
			res.end(head ? undefined : hit.body);
			return true;
		}

		var stat;
		for (var i = 0; !stat && i < roots.length; i++) {
			// Absolute path
			filename = Path.join(roots[i], pathname);

			// Index.html support
			if (filename[filename.length - 1] === Path.sep) {
				filename += "index.html";
			}

			try {
				stat = fs.stat(filename, _);
			} catch (err) {
				if (err.code !== "ENOENT") throw err;
			}
		}

		if (!stat || stat.isDirectory()) return false;

		var data = fs.readFile(filename, _);
		if (opts && opts.transform) data = opts.transform(_, data);

		var mime = utils.mime.type(filename);
		if (mime === "application/octet-stream") {
			// Try to find a better one from content (currently only common image types)
			mime = utils.mime.fromContent(data, mime);
		}

		// Response headers
		var headers = {
			"content-type": mime,
			"content-length": data.length,
			"last-modified": stat.mtime.toUTCString(),
			"cache-control": (opts && opts.nocache) ? "no-cache, no-store, must-revalidate" : "public, max-age=" + (maxAge / 1000),
			"etag": '"' + etag(stat) + '"',
			"expires": (new Date()).toUTCString()
		};

		if (endsWith(filename, '.EXE') || endsWith(filename, '.exe')) {
			var basename = filename.split(Path.sep);
			headers["content-disposition"] = "attachment; filename=\"" + basename[basename.length - 1];
		}

		// Conditional GET
		if (!modified(req, headers)) {
			notModified(res, headers);
			return true;
		}

		res.writeHead(200, headers);
		res.end(head ? undefined : data);

		// Cache support
		if (cache) {
			_cache[cacheKey] = {
				headers: headers,
				body: data
			};
		}
		return true;
	};
};

/**
 * Check if `req` and response `headers`.
 *
 * @param {IncomingMessage} req
 * @param {Object} headers
 * @return {Boolean}
 * @api private
 */

function modified(req, headers) {
	var modifiedSince = req.headers['if-modified-since'],
		lastModified = headers['Last-Modified'],
		noneMatch = req.headers['if-none-match'],
		etag = headers['ETag'];

	// Check If-None-Match
	if (noneMatch && etag && noneMatch == etag) {
		return false;
	}

	// Check If-Modified-Since
	if (modifiedSince && lastModified) {
		modifiedSince = new Date(modifiedSince);
		lastModified = new Date(lastModified);
		// Ignore invalid dates
		if (!isNaN(modifiedSince.getTime())) {
			if (lastModified <= modifiedSince) return false;
		}
	}

	return true;
}

/**
 * Check if `req` is a conditional GET request.
 *
 * @param {IncomingMessage} req
 * @return {Boolean}
 * @api private
 */

function conditionalGET(req) {
	return req.headers['if-modified-since'] || req.headers['if-none-match'];
}

/**
 * Return an ETag in the form of size-mtime.
 *
 * @param {Object} stat
 * @return {String}
 * @api private
 */

function etag(stat) {
	return stat.size + '-' + Number(stat.mtime);
}

/**
 * Respond with 304 "Not Modified".
 *
 * @param {ServerResponse} res
 * @param {Object} headers
 * @api private
 */

function notModified(res, headers) {
	// Strip Content-* headers
	Object.keys(headers).forEach(function(field) {
		if (0 == field.indexOf('Content')) {
			delete headers[field];
		}
	});
	res.writeHead(304, headers);
	res.end();
}

/**
 * Respond with 403 "Forbidden".
 *
 * @param {ServerResponse} res
 * @api private
 */

function forbidden(res) {
	var body = 'Forbidden';
	res.writeHead(403, {
		'Content-Type': 'text/plain',
		'Content-Length': body.length
	});
	res.end(body);
}

/**
 * Clear the memory cache for `key` or the entire store.
 *
 * @param {String} key
 * @api public
 */
exports.clearCache = function(key, opts) {
	if (key) {
		delete _cache[opts ? opts.cachePrefix + key : key];
	} else {
		_cache = {};
	}
}

/**
 * Check if `str` and ends with `pattern`.
 *
 * @param {String} str
 * @param {String} pattern
 * @return {Boolean}
 * @api private
 */
function endsWith(str, pattern) {
	return str.substring(str.length - pattern.length) === pattern;
};
