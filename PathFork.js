let Transflect = require('@mixint/transflect')
let child_process = require('child_process')
let os = require('os')

/**
 * @param {(buffer|string)} lines - data input or output from a program that needs to be split into an array of lines
 * 
 * String coerces Buffer input into Strings, doesn't affect String input
 * Splits on /n or /r/n and concatenates new elements to existing array via spread '...' and push multiple arguments.
 */
Array.prototype.splitPush = function(lines){
    this.push(...String(lines).split(os.EOL))
}

/**
 * @param {object} queryObject - ParsedMessage.query, used for arguments passed to child_process
 * @return {array} - an array of strings, `key=value` pairs, sans `=` if lacking a value.
 * I wonder if there's a way to overload Array.from to transform an object like this...
 */
Array.fromQuery = function(query){
    return Object.entries(query).map(tuple =>
        tuple[1] ? tuple.join('=') : tuple[0]
    )
}

module.exports = class PathFork extends Transflect {
    constructor(){
        super()
        /* setting up some arrays to log the output of the child process */
        this.stdio = {
            stdin:  [],
            stdout: [],
            stderr: [],
        }
    }

    /**
     * child_process.spawn takes a string executable name, an array of arguments, and an options object
     * @return {undefined} - child_process is not a stream, 
     * so no sense in returning it, instead we have to manually attach error handler to 
     *
     *  have to explicitly attach destroy-on-error, kill subprocess if stream errors.
     */
    _open(source){
        this.args = Array.fromQuery(source.query)

        this.fork = child_process.spawn(source.pathname, this.args, {
            env: process.env,  // should there be some other default environment loaded for web requests ?
            cwd: process.cwd() // thought about sending cwd on querystring but I didn't like it...
        })

        this.on('error', error => this.fork.kill())
        this.fork.on('error', error => this.destroy(error))
    }

    /**
     * Keeps a reference to all lines piped to program so you can audit the real input.
     * Then pipes the request body to the stdin of the ongoing program.
     * TODO test this, does a child processes stdin emit drains as expected ?
     */
    _transform(chunk, encoding, done){
        this.stdio.stdin.splitPush(chunk)
        this.fork.stdin.write(chunk) && done() || this.fork.stdin.on('drain', done)
    }

    /**
     * I think I'm at risk of blowing the HighWaterMark on stdout stream,
     * before attaching a data handler, all program output will be buffered
     * so if a program outputs more than 16kB... what happens?
     * TODO is this a race? is there a chance a program will exit before _flush is fired ? probably.
     * Maybe come back to this with lessons from TeleFork.
     */
    _flush(done){
       this.fork.stdout.on('data', data => {
            this.stdio.stdout.splitPush(data)
        })

        this.fork.stderr.on('data', data => {
            this.stdio.stderr.splitPush(data)
        })

        this.fork.on('exit', (signal, code) => {            
            done(null, JSON.stringify({
                source: this.source.pathname,
                args: this.args,
                stdio: this.stdio,
                signal,
                code
            }, null, 2))
        })
    }
}
