let Transflect = require('@mixint/transflect')
let child_process = require('child_process')
let os = require('os')

Array.prototype.splitPush = function(Buffer){
    this.push(...String(Buffer).split(os.EOL))
}

module.exports = class PathFork extends Transflect {
    constructor(opt){
        super(opt)
        /* setting up some arrays to log the output of the child process */
        this.stdio = {
            stdin:  [],
            stdout: [],
            stderr: [],
        }
    }

    /**
     * @param {Object} queryObject - ParsedMessage.query, used for arguments passed to child_process
     * @return {Array} - an array of strings, `key=value` pairs, sans `=` if lacking a value.
     */
    arrayify(queryObject){
        return Object.entries(queryObject).map(tuple =>
            tuple[1] ? tuple.join('=') : tuple[0]
        )
    }

    /**
     * child_process.spawn takes a string executable name, an array of arguments, and an options object
     * @return {undefined} - child_process is not a stream, 
     * so no sense in returning it, instead we have to manually attach error handler to 
     */
    _open(source){
        this.fork = child_process.spawn(
            source.pathname,
            this.arrayify(source.query),
            {
                env: process.env,
                cwd: process.cwd()
            }
        )
        // stdout / stdin don't exist yet or what ??
        // have to explicitly attach destroy-on-error, kill subprocess if stream errors.
        this.on('error', error => this.fork.kill())
        this.fork.on('error', error => this.destroy(error))
    }

    /**
     * Keeps a reference to all lines piped to program so you can audit the real input.
     * Then pipes the request body to the stdin of the ongoing program.
     */
    _transform(chunk, encoding, done){
        this.stdio.stdin.splitPush(chunk)
        // TODO test this, does a child processes stdin emit drains as expected ?
        this.fork.stdin.write(chunk) && done() || this.fork.stdin.on('drain', done)
    }

    /**
     * I think I'm at risk of blowing the HighWaterMark on stdout stream,
     * before attaching a data handler, all program output will be buffered
     * so if a program outputs more than 16kB... what happens?
     */
    _flush(done){
       this.fork.stdout.on('data', data => {
            this.stdio.stdout.splitPush(data)
        })

        this.fork.stderr.on('data', data => {
            this.stdio.stderr.splitPush(data)
        })
        // TODO is this a race? is there a chance a program will exit before _flush is fired ? probably.
        // Maybe come back to this with lessons from TeleFork.
        this.fork.on('exit', (signal, code) => {
            done(null, JSON.stringify({
                source: this.source.pathname,
                args: this.arrayify(this.source.query),
                stdio: this.stdio,
                signal,
                code
            }))
        })
    }
}
