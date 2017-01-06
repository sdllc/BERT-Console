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

// refers to programming languages, not human languages.  this is a map of 
// language name -> file extensions, codemirror module (name), and codemirror 
// dependencies (names again).

module.exports = {

  R: { extensions: [ 'r', 'rscript', 'rsrc' ], path: 'r' },
  Javascript: { extensions: [ 'js', 'jscript', 'json' ], path: 'javascript' },
  HTML: { extensions: [ 'htm', 'html' ], path: 'htmlmixed', depends: [ 'xml', 'javascript', 'css' ] },
  CSS: { extensions: [ 'css' ], path: 'css' },
  Markdown: { extensions: [ 'md', 'markdown' ], path: 'markdown' }

};




