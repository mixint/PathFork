let Transflect = require('@mixint/transflect')
let child_process = require('child_process')

module.exports = class PathFork extends Transflect {
    constructor(opt){
        super(opt)
        this.stdin = this.stdout = this.stderr = []
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
     * @return ${undefined} - child_process is not a stream, so no sense in returning it
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
        // have to explicitly attach destroy-on-error
        this.fork.on('error', error => this.destroy(error))
    }

    /**
     * Keeps a reference to all lines piped to program so you can audit the real input.
     * Then pipes the request body to the stdin of the ongoing program.
     */
    _transform(chunk, encoding, done){
        this.stdin = this.stdin.concat(chunk.toString().split('\n'))
        this.fork.stdin.write(chunk) && done() || this.fork.stdin.on('drain', done)
    }

    /**
     * I think I'm at risk of blowing the HighWaterMark on stdout stream,
     * before attaching a data handler, all program output will be buffered
     * so if a program outputs more than 16kB... what happens?
     */
    _flush(done){
        this.fork.stdout.on('data', chunk => {
            this.stdout = this.stdout.concat(chunk.toString().split('\n'))
        })
        this.fork.stderr.on('data', chunk => {
            this.stderr = this.stderr.concat(chunk.toString().split('\n'))
        })

        this.fork.on('exit', (signal, code) => {
            done(null, JSON.stringify({
                source: this.source.pathname,
                args: this.arrayify(this.source.query),
                stdin: this.stdin,
                stdout: this.stdout,
                stderr: this.stderr,
                signal,
                code
            }))
        })
    }
}
