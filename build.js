"use strict";
var fsp = require('path');
var compile = require('streamline-helpers').compileSync;

['callbacks', 'fibers', 'generators'].forEach(function(runtime) {
	compile(fsp.join(__dirname, 'src'), fsp.join(__dirname, 'lib', runtime), runtime);
});
