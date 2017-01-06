/**
 * Copyright (c) 2016-2017 Structured Data, LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to 
 * deal in the Software without restriction, including without limitation the 
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or 
 * sell copies of the Software, and to permit persons to whom the Software is 
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in 
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

"use strict";

const Utils = require( './utils.js' );
const https = require( "https" );

Utils.initDefaults( Settings, {
  update: {
    etag: false,
    lastVersion: 0,
    notifyVersion: 0
  }
});

let request = function(force){
  return new Promise( function( resolve, reject ){
    var options = {
      host: 'api.github.com',
      path: '/repos/sdllc/Basic-Excel-R-Toolkit/releases/latest',
      headers: { 
        'user-agent': 'https://github.com/sdllc/BERT-Console'
      }
    };

    if( !force && Settings.update.etag ) options.headers['If-None-Match'] = Settings.update.etag;
    let callback = function(response) {
      let str = '';
      response.on('data', function (chunk) { str += chunk; });
      response.on('end', function () {
        let data;
        try {
          data = str.length ? JSON.parse(str) : {};
          resolve({ data: data, headers: response.headers, status: response.statusCode });
        }
        catch(e){ reject(e); }
      });
    };

    https.request(options, callback).end();
  });
};

module.exports.checkForUpdates = function( force ){
  return new Promise( function( resolve, reject ){
    request( force ).then( function( rsp ){
      if( rsp.status === 200 ){
        if( rsp.headers.etag ) Settings.update.etag = rsp.headers.etag;
        if( rsp.data.tag_name ){
          let version = Number( rsp.data.tag_name.substr(1));
          Settings.update.lastVersion = version;
        }
      }
      resolve();
    });
  });
};

