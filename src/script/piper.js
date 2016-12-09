/**
 * Copyright (c) 2016 Structured Data, LLC
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

"use strict"

const fs = require("fs");
const os = require("os");
const net = require("net");
const path = require("path");
const events = require("events");
const child_process = require("child_process");

/** delay via promise */
const pause = function (delay, func) {
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      if (func) func.call(this);
      resolve(true);
    }, delay);
  });
};

/** write to socket */
const write_packet = function (socket, packet) {
  return new Promise(function (resolve, reject) {
    socket.write(JSON.stringify(packet) + "\n\0", function () {
      resolve(arguments);
    });
  });
};

/**
 * buffer is an object, see note below
 */
const on_read = function (socket, buffer, callback) {

  let str = socket.read();
  if (!str) return;

  let elts = str.split("\n");

  elts.map(function (x) {

    if (x.length) { // why are 0-len packets in this array?

      if (buffer.data.length) x = buffer.data + x;

      // valid packet (probably? cheaper than try/catch)
      if (x.trim().endsWith('}')) {
        buffer.data = "";
        if (x.trim().length) {
          let json = null;
          try { json = JSON.parse(x); }
          catch (e) {
            console.info(`[controlr] parse exception: ${e} (packet ${packet_id} in global.packet)`);
            global.packet = x;
          }
          if (json) callback(json);
        }
      }
      else {
        buffer.data = x;
      }
    }

  });

};

/**
 * turn a command object into an R string.  this is a 
 * convenience allowing you to pass arguments as objects 
 * without converting to strings.  
 * 
 * there are limitations, of course.  for now we just 
 * support basic types and arrays; arrays will always become
 * vectors (not lists).
 * 
 * update with some limited support for objects ( -> names )
 * 
 * obj : { "command", [arguments] }
 */
const unpack_arguments = function( command, args ){

  // tail fn
  let unpack_ = function(o){
    if (!Array.isArray(o)) o = [o];
    return o.map( function( arg ){
      switch( typeof arg ){
      case "number": 
        return arg;
      case "boolean":
        return arg ? "T" : "F"; 
      case "string":
        return `"${arg}"`;
      case "object":
        if( Array.isArray( arg ))
          return `c(${unpack_(arg)})`;
        else {
          return Object.keys(arg).map( function( k ){
            return `${k}=${unpack_([arg[k]])}`;
          }).join( "," );
        }
      default:
        // FIXME: should warn the caller, perhaps throw?
        return "NULL";
      };
    }).join( "," );
  };

  let str = `${command}(`;
  str += unpack_(args || []);
  str += ");";

  return str;

};

const PipeR = function () {

  let busy = false;
  let opts = null;
  let notify = null;
  let socket_file = null;
  let socket = null;
  let server = null;

	/** 
	 * command queue
	 */
  let command_queue = [];

  /** pop the queue and exec */
  let run_command_queue = function () {
    if (!busy && command_queue.length) {
      let packet = command_queue.shift();
      exec_packet({ command: packet.exec_channel, commands: packet.command }).then(function (response) {
        packet.resolve.call(this, response);
      }).catch(function () {
        packet.reject.apply(this, arguments);
      });
    }
  };

  // NOTE: on linux, binding a function to a string does not pass 
  // the string by reference.  therefore if we want the buffer passed 
  // by reference we need to wrap it in an object and bind the object.

  let buffer = { data: "" };

  let instance = this;

	/** 
	 * buffering console messages.  this is more important on linux than 
	 * on windows, b/c we get lots of small writes.
	 */
  let console_buffer = "";

	/**
	 * timer handle for the console buffer, also used as a flag
	 */
  let interval = null;

  /** send whatever's in the console buffer */
  let flush_console = function () {
    interval = null;
    instance.emit('console', console_buffer);
    console_buffer = "";
  }

  let read_callback = function (packet) {

    if (packet.type) {
      switch (packet.type) {

        case "response":
        case "exec-response":
          if (notify) notify.call(this, packet);
          break;

        case "prompt":

          // signals the end of an exec.  

          // FIXME: split notify callbacks for exec and 
          // internal, otherwise they'll get crossed in debug ops <-- ??

          if (notify) notify.call(this, packet);
          else instance.emit('system', packet); // send this to the renderer for possible handling
          break;

        case "console":

          // unbuffered version.  we're buffering on the 
          // child process now, should be sufficient, although
          // we can turn this on again if necessary.
          instance.emit('console', packet.message, packet.flag);

          // buffered
          /*
          if( interval ) clearTimeout( interval );
          console_buffer += packet.message;
          interval = setTimeout( flush_console, 50 );
          */

          break;

        case "sync-request":

          // adding an async call for the "sync"" callback.  leaving
          // the old version in place (for now)

          if (opts['sync-request-promise']) {
            opts['sync-request-promise'].call(this, packet.data)
              .then(function (response) {
                write_packet(socket, { command: 'sync-response', response: response });
              }).catch(function (err) {
                write_packet(socket, { command: 'sync-response', response: err });
              });
          }
          else {
            let response = null;
            if (opts['sync-request']) {
              response = opts['sync-request'].call(this, packet.data);
            }
            write_packet(socket, { command: 'sync-response', response: response });
          }

          break;

        case "heartbeat":

          // console.info( "heartbeat" );

          break;

        case "push":
          instance.emit( "push", packet );
          break;

        case "control":

            if( packet.data === "quit" ){
              try {
                client.end();
                client.destroy();
              }
              catch( e ){
                console.info(e);
              }
              instance.emit( "pipe-closed" );
              break;
            }

        default:
          //if (opts.permissive) 
          {

            // FIXME: log this packet type?
            instance.emit(packet.type, packet.data);
          }
          //else console.info("unexpected packet type", packet);
      }
    }
    else console.info("Packet missing type", packet);
  };

  let close = function () {
    server.close(this, function () {

      // FIXME: if this is the last call in the application,
      // is there a possibility it will exit before removing 
      // this file?  I think not, but could perhaps verify.
      if (socket_file) fs.unlink(socket_file);

    });
  };

  /**
   * generic exec function.  
   */
  let exec_packet = function (packet) {

    return new Promise(function (resolve, reject) {
      if (busy) reject("busy");
      else {
        busy = true;
        instance.emit('state-change', busy);
        notify = function (response) {

          // generally if we were buffering command output, and the 
          // command is complete, messages should be finished.  that
          // might not account for clogged pipes, though. [TODO: stress test]

          if (interval) {
            clearTimeout(interval);
            flush_console(); // nulls interval
          }

          busy = false;
          notify = null;

          if (response) {
            if (response.parsestatus === 3) reject(response); // parse err
            else resolve(response);
          }
          else reject();

          setImmediate(function () {
            instance.emit('state-change', busy);
            run_command_queue.call(instance);
          });

        };
        write_packet(client, packet);
      }
    });

  };

  /** get state */
  this.busy = function () { return busy; }

	/**
	 * send break
	 */
  this.send_break = function (msg) {
    write_packet(socket, { command: 'break', msg: msg });
  };

	/** 
	 * execute a command or, if busy, queue it up for execution.
	 * key is a field which is matched against existing keys.  if set, and 
	 * if a matching key is found, the PREVIOUS queued call will be removed.
	 * 
	 * that's for things like "set console width", where we might have 
	 * mutliple queued calls and the earlier calls are superfluous.
	 */
  this.queue_or_exec = function (commands, exec_channel, key) {

    if (!busy) {
      return exec_packet({ command: exec_channel, commands: commands });
    }

    return new Promise(function (resolve, reject) {
      if (key) {
        let tmp = [];
        command_queue.map(function (x) {
          if (x.key !== key || x.exec_channel !== exec_channel) tmp.push(x);
          else if (x.reject) x.reject.call(this, "superceded");
        })
        command_queue = tmp;
      }
      command_queue.push({ command: commands, key: key, exec_channel: exec_channel, resolve: resolve, reject: reject });
    });

  };

  this.do_call = function( command, args, channel ){
    command = unpack_arguments( command, args );
    return this.queue_or_exec( command, channel || "internal" );
  };

  /**
   * execute command on the internal channel (returns result)
   */
  this.internal = function (commands, key) {
    return this.queue_or_exec(commands, "internal", key);
  };

  /**
   * execute command on the "exec" channel 
   */
  this.exec = function (commands, key) {
    return this.queue_or_exec(commands, "exec", key);
  };

  // temp
  this.tx = function( commands ){
    if( !Array.isArray( commands )) commands = [commands];
    commands.forEach( function( command ){
      console.info( "writing", command );
      client.write( command );
    });
  }

  /** shutdown and clean up */
  this.shutdown = function () {
    return new Promise(function (resolve, reject) {
      if (socket) {
        exec_packet({ command: 'rshutdown' }).then(function () {
          close();
          server = null;
          resolve();
        }).catch(function (e) {
          close();
          server = null;
          reject(e);
        });
      }
      else if (server) {
        close();
        server = null;
        resolve();
      }
      else reject("invalid state");
    });
  };

  let client;
  this.initialized = false;

  this.init = function(opts){

    opts = opts || {};
    let s = "";

    if( !opts.pipename ) throw( "Missing pipe name");
    client = net.createConnection({path: "\\\\.\\pipe\\" + opts.pipename}, () => {
      //'connect' listener
      console.log('connected to service');
    });
    client.setEncoding('utf8');
    client.on("readable", on_read.bind(this, client, buffer, read_callback));

    /*
    client.on('data', (data) => {

      s += data.toString();
      let messages = s.split( "\n" );
      s = "";
      messages.forEach( function(m){
        if( m.endsWith( "}" )){
          let msg = JSON.parse( m );
          if( msg.message === "console" ) this.emit( "console", msg.data );
        }
        else s += m;
      }, this);

    });
    */

    client.on('end', () => {
      console.log('disconnected from pipe (xmit)');
      this.emit( "pipe-closed" );
    });

    this.initialized = true;
  }

  /**
   * init the connection.  why an init method and not just init in the 
   * constructor? (1) it's symmetric with the shutdown method, which we
   * need to clean up, and (2) you can set up event handlers before 
   * initializing.
   * /
  this.init = function () {

    opts = arguments[0] || {};
    if (opts.debug) console.info("controlr init", opts);

    return new Promise(function (resolve, reject) {

      if (server) reject("already initialized");
      let args = [];

      // default to pipe, but support "tcp".  in the case of tcp, 
      // additional options [default]:
      // host ["127.0.0.1"]
      // port [1440]
      // last_port [1480]

      if (opts.connection_type === "tcp") {

        let host = opts.host || DEFAULT_TCP_HOST;
        let start_port = DEFAULT_TCP_PORT_START;
        let end_port = DEFAULT_TCP_PORT_END;

        if (opts.port) {
          start_port = opts.port;
          end_port = (opts.last_port && opts.last_port > opts.port) ? opts.last_port : opts.port;
        }

        check_port(start_port, host, end_port - start_port).then(function (port) {
          args = [host, port];
          server = net.createServer().listen(port, host, connect_callback.bind(this, opts, args, resolve, reject));
        }).catch(function (e) {
          reject(e);
        });

      }
      else {
        socket_file = create_pipe_name();
        args = [socket_file];
        server = net.createServer().listen(socket_file, connect_callback.bind(this, opts, args, resolve, reject));
      }

    });

  };
  */

/*
  let connect_callback = function (opts, args, resolve, reject) {

    // set up to catch the child connection
    server.on("connection", function () {

      if (opts.debug) console.info("connection");
      if (socket) reject("too many clients");

      socket = arguments[0];
      socket.setEncoding('utf8');
      socket.on("readable", on_read.bind(this, socket, buffer, read_callback));
      socket.on("close", function () {
        if (opts.debug) console.info("socket close", arguments);
        socket = null;
      });
      socket.on("error", function () {
        if (opts.debug) console.info("socket error", arguments);
      });

      pause(100).then(function () {
        if (opts.debug) console.info("calling init");
        //interval = setInterval( flush_console.bind( instance ), 50 );
        return exec_packet({
          command: 'rinit',
          rhome: opts.rhome || ""
        });
      }).then(function (obj) {
        if (opts.debug) console.info("init complete");
        resolve(obj);
      }).catch(function (e) {
        console.info("Exception in init", e);
        reject(e);
      });

    });

    // then create the child
    let proc = start_child_process(opts, args);

    proc.on('close', function () {
      if (notify) {
        if (opts.debug) console.info("Close and pending notify...");
        notify(0);
        close();
        server = null;
      }
    });

    // originally we just looked at the streams for debug.  however it turns
    // out that, at least on linux, some useful information is dumped here --
    // in particular, build commands when installing packages.  so we probably
    // need to keep it.  note that this will definitely not work for remote
    // processes, unless we send it explicitly.  but ok for now.

    if (proc.stdout) {
      proc.stdout.on('data', (data) => {
        instance.emit('r.stdout', data);
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (data) => {
        instance.emit('r.stderr', data);
      });
    }

	 };
   */

  // notwithstanding the above comment, you can init right away if you want
  if (arguments[0]) this.init.apply(this, arguments);

};

// inherits from event emitter
Object.assign( PipeR.prototype, events.EventEmitter.prototype );

module.exports = PipeR;

