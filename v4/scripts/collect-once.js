'use strict';
const {collectOnce}=require('../lib/collector');
const {close}=require('../lib/database');
collectOnce().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error('Collection failed:',error.code||error.message);process.exitCode=1;}).finally(close);
